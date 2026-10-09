/**
 * The LogiStack Worker: serves the built app (static assets) and a small API under /api for
 * accounts and sync. Every request to /api is identified (auth.ts); data rows always belong to
 * the caller, except profiles their owners shared, which everyone can read.
 *
 *   GET    /api/me                      who am I, my plan, limits and usage
 *   GET    /api/items?kind=hand         my items of a kind (+ shared profiles of others)
 *   PUT    /api/items/:kind/:id         save one item  { data, shared? }
 *   DELETE /api/items/:kind/:id         delete one item (kept as a tombstone)
 *   GET    /api/admin/users             admin: everyone, with plan and usage
 *   PUT    /api/admin/users/:email      admin: { plan?, role? }
 */

import { canSave, canShare, isKind, isPlan, limitsFor, KINDS, type Kind, type Plan, type Role } from '../src/shared/plans';
import { identify, type AuthEnv } from './auth';

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
}

const MAX_BODY = 512 * 1024;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fail = (status: number, error: string, message: string) => reply({ error, message }, status);

async function userFor(env: Env, email: string): Promise<User> {
  const now = new Date().toISOString();
  const admins = (env.ADMIN_EMAILS ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  await env.DB.prepare('INSERT INTO users (email, plan, role, created_at, seen_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT(email) DO UPDATE SET seen_at = ?4')
    .bind(email, 'free', admins.includes(email) ? 'admin' : 'user', now)
    .run();
  const row = await env.DB.prepare('SELECT email, plan, role FROM users WHERE email = ?1').bind(email).first<User>();
  const user: User = { email, plan: isPlan(row?.plan) ? row!.plan : 'free', role: (row?.role as Role) ?? 'user' };
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
        const rows = await env.DB.prepare('SELECT owner, id, data, updated_at FROM items WHERE kind = ?1 AND shared = 1 AND deleted = 0 AND owner != ?2')
          .bind(kind, email)
          .all<{ owner: string; id: string; data: string; updated_at: string }>();
        sharedByOthers = rows.results.map((r) => ({ id: r.id, owner: r.owner, data: JSON.parse(r.data), updatedAt: r.updated_at }));
      }
      return reply({ items, shared: sharedByOthers });
    }

    const [, kind, id] = parts;
    if (!isKind(kind) || !id || parts.length !== 3 || id.length > 128) return fail(404, 'route', 'No such item route.');

    if (method === 'PUT') {
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

  if (parts[0] === 'admin') {
    if (me.role !== 'admin') return fail(403, 'admin', 'Admins only.');
    if (parts[1] === 'users' && parts.length === 2 && method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT u.email, u.plan, u.role, u.created_at AS createdAt, u.seen_at AS seenAt, ' +
          "(SELECT COUNT(*) FROM items i WHERE i.owner = u.email AND i.deleted = 0) AS items FROM users u ORDER BY u.seen_at DESC",
      ).all();
      return reply({ users: rows.results });
    }
    if (parts[1] === 'users' && parts[2] && method === 'PUT') {
      const target = decodeURIComponent(parts[2]).toLowerCase();
      const body = (await req.json().catch(() => ({}))) as { plan?: unknown; role?: unknown };
      if (body.plan !== undefined && !isPlan(body.plan)) return fail(400, 'plan', 'Unknown plan.');
      if (body.role !== undefined && !['user', 'editor', 'admin'].includes(body.role as string)) return fail(400, 'role', 'Unknown role.');
      const r = await env.DB.prepare('UPDATE users SET plan = COALESCE(?2, plan), role = COALESCE(?3, role) WHERE email = ?1')
        .bind(target, (body.plan as string | undefined) ?? null, (body.role as string | undefined) ?? null)
        .run();
      if (!r.meta.changes) return fail(404, 'user', 'No such user (they have to log in once first).');
      return reply({ ok: true });
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
