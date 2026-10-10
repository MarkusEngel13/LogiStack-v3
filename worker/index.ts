/**
 * The LogiStack Worker: serves the built app (static assets) and a small API under /api for
 * accounts, sync, the admin dashboard and "Consider this". Every request to /api is identified
 * (auth.ts); data rows always belong to the caller, except profiles their owners shared, which
 * everyone can read - under a pseudonym, never the email. The types: src/shared/api.ts.
 *
 *   GET    /api/me                      who am I, my plan, limits, usage, open Premium request
 *   GET    /api/items?kind=hand         my items of a kind (+ shared profiles of others)
 *   PUT    /api/items/:kind/:id         save one item  { data, shared? }  (quiz: only its own ids)
 *   DELETE /api/items/:kind/:id         delete one item (kept as a tombstone)
 *   POST   /api/premium-request         ask for Premium (Free users only)  -> { premiumRequest }
 *   DELETE /api/premium-request         take the request back              -> { premiumRequest: null }
 *   POST   /api/advice                  { tags } -> the advice that fits, as many as the plan shows
 *   GET    /api/admin/users             admin: everyone, with plan, items per kind, note, request
 *   PUT    /api/admin/users/:email      admin: { plan?, role?, note?, premiumRequest?: null }
 *   DELETE /api/admin/users/:email      admin: a user and all their data (never an admin or yourself)
 *   GET    /api/admin/advice            admin: the books of advice on the server
 *   PUT    /api/admin/advice            admin: one part of a book (part 0 replaces the book)
 *   DELETE /api/admin/advice/:book      admin: a whole book
 */

import { matchAdvice } from '../src/core/advice/playbook';
import type { AdminUser, AdviceAnswer, AdviceBook, ServerAdvice } from '../src/shared/api';
import { canSave, canShare, isKind, isPlan, limitsFor, KINDS, PLAN_LABELS, type Kind, type Plan, type Role } from '../src/shared/plans';
import { identify, type AuthEnv } from './auth';
import { adminEmails, checkAdviceUpload, checkTags, checkUserPatch, itemCounts, itemIdAllowed, ownerName, pathPart } from './checks';

export interface Env extends AuthEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Comma-separated emails that are admins (Marius). */
  ADMIN_EMAILS?: string;
}

interface User {
  email: string;
  plan: Plan;
  role: Role;
  /** An open request for Premium (ISO time), or null. */
  premiumRequest: string | null;
}

const MAX_BODY = 512 * 1024;
/** D1 binds at most 100 values a query: the book and the time, then id and data per row. */
const ROWS_PER_INSERT = 40;
/** How long an isolate keeps the advice before reading it again (an upload here clears it at once). */
const ADVICE_TTL = 5 * 60 * 1000;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fail = (status: number, error: string, message: string) => reply({ error, message }, status);

/** The request's JSON (at most `max` bytes), or the error to send back. */
async function readJson(req: Request, max = MAX_BODY): Promise<{ body: unknown } | Response> {
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > max) return fail(413, 'size', 'Request too large.');
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return fail(400, 'json', 'Bad JSON.');
  }
}

async function userFor(env: Env, email: string): Promise<User> {
  const now = new Date().toISOString();
  const admins = adminEmails(env.ADMIN_EMAILS);
  await env.DB.prepare('INSERT INTO users (email, plan, role, created_at, seen_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT(email) DO UPDATE SET seen_at = ?4')
    .bind(email, 'free', admins.includes(email) ? 'admin' : 'user', now)
    .run();
  const row = await env.DB.prepare('SELECT plan, role, premium_request FROM users WHERE email = ?1')
    .bind(email)
    .first<{ plan: string; role: string; premium_request: string | null }>();
  const user: User = { email, plan: isPlan(row?.plan) ? row!.plan : 'free', role: (row?.role as Role) ?? 'user', premiumRequest: row?.premium_request ?? null };
  // an admin listed in ADMIN_EMAILS stays admin even if the table says otherwise
  if (admins.includes(email) && user.role !== 'admin') {
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE email = ?1").bind(email).run();
    user.role = 'admin';
  }
  return user;
}

async function usage(env: Env, email: string): Promise<Record<Kind, number>> {
  const rows = await env.DB.prepare('SELECT kind, COUNT(*) AS n FROM items WHERE owner = ?1 AND deleted = 0 GROUP BY kind').bind(email).all<{ kind: string; n: number }>();
  const out = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
  for (const r of rows.results) if (isKind(r.kind)) out[r.kind] = r.n;
  return out;
}

// all the advice, kept per isolate for a few minutes: every moment of a hand asks for it
let adviceCache: { at: number; entries: ServerAdvice[] } | null = null;

async function allAdvice(env: Env): Promise<ServerAdvice[]> {
  if (adviceCache && Date.now() - adviceCache.at < ADVICE_TTL) return adviceCache.entries;
  const rows = await env.DB.prepare('SELECT data FROM advice').all<{ data: string }>();
  const entries: ServerAdvice[] = [];
  for (const r of rows.results) {
    try {
      entries.push(JSON.parse(r.data) as ServerAdvice);
    } catch {
      // a broken row is skipped, never the whole answer
    }
  }
  adviceCache = { at: Date.now(), entries };
  return entries;
}

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const email = await identify(req, env);
  if (!email) return fail(401, 'login', 'Not logged in.');
  const me = await userFor(env, email);
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
  const method = req.method;

  if (parts[0] === 'me' && method === 'GET') {
    return reply({ ...me, limits: limitsFor(me.plan, me.role), usage: await usage(env, email) });
  }

  if (parts[0] === 'items') {
    if (method === 'GET' && parts.length === 1) {
      const kind = url.searchParams.get('kind');
      if (!isKind(kind)) return fail(400, 'kind', 'Unknown kind.');
      const own = await env.DB.prepare('SELECT id, data, shared, updated_at, deleted FROM items WHERE owner = ?1 AND kind = ?2')
        .bind(email, kind)
        .all<{ id: string; data: string; shared: number; updated_at: string; deleted: number }>();
      const items = own.results.map((r) => ({ id: r.id, data: r.deleted ? null : JSON.parse(r.data), shared: !!r.shared, updatedAt: r.updated_at, deleted: !!r.deleted }));
      let sharedByOthers: unknown[] = [];
      if (kind === 'profile') {
        const rows = await env.DB.prepare(
          'SELECT i.owner, i.id, i.data, i.updated_at, u.role FROM items i LEFT JOIN users u ON u.email = i.owner ' +
            'WHERE i.kind = ?1 AND i.shared = 1 AND i.deleted = 0 AND i.owner != ?2',
        )
          .bind(kind, email)
          .all<{ owner: string; id: string; data: string; updated_at: string; role: string | null }>();
        // never another user's email: admins share as "LogiStack", everyone else under a pseudonym
        const admins = adminEmails(env.ADMIN_EMAILS);
        const names = new Map<string, string>();
        for (const r of rows.results) {
          if (!names.has(r.owner)) names.set(r.owner, await ownerName(r.owner, r.role === 'admin' || admins.includes(r.owner)));
        }
        sharedByOthers = rows.results.map((r) => ({ id: r.id, owner: names.get(r.owner), data: JSON.parse(r.data), updatedAt: r.updated_at }));
      }
      return reply({ items, shared: sharedByOthers });
    }

    // the app sends ids encoded (day:2026-10-10 -> day%3A2026-10-10): stored as the app knows them
    const kind = parts[1];
    const id = pathPart(parts[2]);
    if (!isKind(kind) || !id || parts.length !== 3 || id.length > 128) return fail(404, 'route', 'No such item route.');

    if (method === 'PUT') {
      if (!itemIdAllowed(kind, id)) return fail(400, 'id', 'No such quiz item (state, history or day:YYYY-MM-DD).');
      const text = await req.text();
      if (text.length > MAX_BODY) return fail(413, 'size', 'Item too large.');
      let body: { data?: unknown; shared?: unknown };
      try {
        body = JSON.parse(text) as typeof body;
      } catch {
        return fail(400, 'json', 'Bad JSON.');
      }
      if (body.data === undefined || body.data === null) return fail(400, 'data', 'No data.');
      const shared = kind === 'profile' && body.shared === true;
      if (shared) {
        const ok = canShare(me.plan, me.role);
        if (!ok.ok) return fail(403, ok.reason, ok.message);
      }
      const existing = await env.DB.prepare('SELECT deleted FROM items WHERE owner = ?1 AND kind = ?2 AND id = ?3').bind(email, kind, id).first<{ deleted: number }>();
      const isNew = !existing || existing.deleted === 1;
      const counts = await usage(env, email);
      const ok = canSave(me.plan, me.role, kind, counts[kind], isNew);
      if (!ok.ok) return fail(403, ok.reason, ok.message);
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO items (owner, kind, id, data, shared, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0) ' +
          'ON CONFLICT(owner, kind, id) DO UPDATE SET data = ?4, shared = ?5, updated_at = ?6, deleted = 0',
      )
        .bind(email, kind, id, JSON.stringify(body.data), shared ? 1 : 0, now)
        .run();
      return reply({ ok: true, updatedAt: now });
    }

    if (method === 'DELETE') {
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE items SET deleted = 1, data = '{}', shared = 0, updated_at = ?4 WHERE owner = ?1 AND kind = ?2 AND id = ?3")
        .bind(email, kind, id, now)
        .run();
      return reply({ ok: true, updatedAt: now });
    }
  }

  if (parts[0] === 'premium-request' && parts.length === 1) {
    if (method === 'POST') {
      // only a Free user asks: Premium and Pro have it already, admins and editors have everything
      if (me.role !== 'user') return fail(409, 'plan', 'You have everything already.');
      if (me.plan !== 'free') return fail(409, 'plan', `The ${PLAN_LABELS[me.plan]} plan includes everything Premium has.`);
      const now = new Date().toISOString();
      // asking again keeps the first time (the admin sees how long they waited)
      await env.DB.prepare('UPDATE users SET premium_request = COALESCE(premium_request, ?2) WHERE email = ?1').bind(email, now).run();
      return reply({ premiumRequest: me.premiumRequest ?? now });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('UPDATE users SET premium_request = NULL WHERE email = ?1').bind(email).run();
      return reply({ premiumRequest: null });
    }
  }

  if (parts[0] === 'advice' && parts.length === 1 && method === 'POST') {
    const r = await readJson(req, 16 * 1024);
    if (r instanceof Response) return r;
    const tags = checkTags((r.body as { tags?: unknown } | null)?.tags);
    if (!tags.ok) return fail(400, 'tags', tags.message);
    const perSpot = limitsFor(me.plan, me.role).advicePerSpot;
    const entries = await allAdvice(env);
    // the same id in two books shows once
    const seen = new Set<string>();
    const best = matchAdvice(entries, tags.value, entries.length)
      .filter((m) => !seen.has(m.entry.id) && !!seen.add(m.entry.id))
      .slice(0, perSpot);
    const answer: AdviceAnswer = { entries: best.map(({ entry: e }) => ({ id: e.id, title: e.title, advice: e.advice })), perSpot };
    return reply(answer);
  }

  if (parts[0] === 'admin') {
    if (me.role !== 'admin') return fail(403, 'admin', 'Admins only.');
    const admins = adminEmails(env.ADMIN_EMAILS);

    if (parts[1] === 'users' && parts.length === 2 && method === 'GET') {
      const [users, counts] = await Promise.all([
        env.DB.prepare('SELECT email, plan, role, created_at, seen_at, note, premium_request FROM users ORDER BY seen_at DESC').all<{
          email: string;
          plan: string;
          role: string;
          created_at: string;
          seen_at: string;
          note: string | null;
          premium_request: string | null;
        }>(),
        env.DB.prepare('SELECT owner, kind, COUNT(*) AS n FROM items WHERE deleted = 0 GROUP BY owner, kind').all<{ owner: string; kind: string; n: number }>(),
      ]);
      const perUser = itemCounts(counts.results);
      const list: AdminUser[] = users.results.map((u) => ({
        email: u.email,
        plan: isPlan(u.plan) ? u.plan : 'free',
        role: admins.includes(u.email) ? 'admin' : (u.role as Role),
        createdAt: u.created_at,
        seenAt: u.seen_at,
        items: perUser.get(u.email) ?? {},
        note: u.note,
        premiumRequest: u.premium_request,
      }));
      return reply({ users: list });
    }

    if (parts[1] === 'users' && parts.length === 3 && method === 'PUT') {
      const target = pathPart(parts[2])?.toLowerCase();
      if (!target) return fail(400, 'user', 'Bad email.');
      const r = await readJson(req);
      if (r instanceof Response) return r;
      const patch = checkUserPatch(r.body);
      if (!patch.ok) return fail(400, 'patch', patch.message);
      const p = patch.value;
      const sets: string[] = [];
      const values: (string | null)[] = [];
      const set = (column: string, value: string | null) => {
        values.push(value);
        sets.push(`${column} = ?${values.length + 1}`);
      };
      if (p.plan) set('plan', p.plan);
      if (p.role) set('role', p.role);
      if (p.note !== undefined) set('note', p.note);
      // a request is answered once they have Premium or Pro, even if the admin only set the plan
      if (p.premiumRequest === null || (p.plan && p.plan !== 'free')) set('premium_request', null);
      const changed = sets.length
        ? (await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE email = ?1`).bind(target, ...values).run()).meta.changes
        : (await env.DB.prepare('SELECT 1 AS x FROM users WHERE email = ?1').bind(target).first()) ? 1 : 0;
      if (!changed) return fail(404, 'user', 'No such user (they have to log in once first).');
      return reply({ ok: true });
    }

    if (parts[1] === 'users' && parts.length === 3 && method === 'DELETE') {
      const target = pathPart(parts[2])?.toLowerCase();
      if (!target) return fail(400, 'user', 'Bad email.');
      if (target === email) return fail(403, 'self', 'You cannot delete yourself.');
      const row = await env.DB.prepare('SELECT role FROM users WHERE email = ?1').bind(target).first<{ role: string }>();
      if (admins.includes(target) || row?.role === 'admin') return fail(403, 'admin', 'Admins are never deleted.');
      if (!row) return fail(404, 'user', 'No such user.');
      // the items first (they point at the user), both in one transaction
      await env.DB.batch([env.DB.prepare('DELETE FROM items WHERE owner = ?1').bind(target), env.DB.prepare('DELETE FROM users WHERE email = ?1').bind(target)]);
      return reply({ ok: true });
    }

    if (parts[1] === 'advice' && parts.length === 2 && method === 'GET') {
      const rows = await env.DB.prepare('SELECT book, COUNT(*) AS entries, MAX(updated_at) AS updatedAt FROM advice GROUP BY book ORDER BY book').all<AdviceBook>();
      return reply({ books: rows.results });
    }

    if (parts[1] === 'advice' && parts.length === 2 && method === 'PUT') {
      const r = await readJson(req);
      if (r instanceof Response) return r;
      const upload = checkAdviceUpload(r.body);
      if (!upload.ok) return fail(400, 'advice', upload.message);
      const { book, part, entries } = upload.value;
      const now = new Date().toISOString();
      const statements: D1PreparedStatement[] = [];
      if (part === 0) statements.push(env.DB.prepare('DELETE FROM advice WHERE book = ?1').bind(book));
      for (let i = 0; i < entries.length; i += ROWS_PER_INSERT) {
        const chunk = entries.slice(i, i + ROWS_PER_INSERT);
        const rows = chunk.map((_, j) => `(?1, ?${3 + 2 * j}, ?${4 + 2 * j}, ?2)`).join(', ');
        statements.push(
          env.DB.prepare(`INSERT INTO advice (book, id, data, updated_at) VALUES ${rows} ON CONFLICT(book, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`).bind(
            book,
            now,
            ...chunk.flatMap((e) => [e.id, JSON.stringify(e)]),
          ),
        );
      }
      // one transaction: a part goes in whole or not at all
      if (statements.length) await env.DB.batch(statements);
      adviceCache = null;
      return reply({ ok: true, book, part, entries: entries.length });
    }

    if (parts[1] === 'advice' && parts.length === 3 && method === 'DELETE') {
      const book = pathPart(parts[2])?.trim();
      if (!book) return fail(400, 'book', 'Bad book name.');
      const r = await env.DB.prepare('DELETE FROM advice WHERE book = ?1').bind(book).run();
      adviceCache = null;
      return reply({ ok: true, deleted: r.meta.changes });
    }
  }

  return fail(404, 'route', 'No such API route.');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url);
      } catch (e) {
        return fail(500, 'server', e instanceof Error ? e.message : String(e));
      }
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
