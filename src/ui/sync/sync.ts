/**
 * Sync between this browser and the server (worker/), for everything the app keeps in
 * localStorage: hands, players, profiles, your charts, settings, "smells fishy" marks.
 *
 * The app keeps working exactly as before - every page reads and writes localStorage - and this
 * module mirrors it: at start it pulls from the server and merges (merge.ts), and after any write
 * to a synced key it pushes the changes a moment later. No server (plain `npm run dev`, offline,
 * not logged in): the app runs local-only, as it always did.
 */

import { limitsFor, type Kind, type Limits, type Plan, type Role } from '../../shared/plans';
import { hashOf, merge, type Item, type ServerItem, type Shadow } from './merge';

interface Store {
  kind: Kind;
  key: string;
  /** One object (settings), stored on the server as the item "main". */
  single?: boolean;
  /** Items that stay in this browser only. */
  keep?: (x: Record<string, unknown>) => boolean;
}

const STORES: Store[] = [
  // watched bot hands come and go by the hundred: only the ones kept (📌) sync
  { kind: 'hand', key: 'logistack.hands.v0', keep: (h) => !h.watch || !!(h.watch as { keep?: boolean }).keep },
  { kind: 'player', key: 'logistack.players.v1' },
  { kind: 'profile', key: 'logistack.profiles.v1' },
  { kind: 'range', key: 'logistack.ranges.v1' },
  { kind: 'settings', key: 'logistack.settings.v1', single: true },
  { kind: 'fishy', key: 'logistack.fishy.v0' },
];

/** Profiles others shared, as the Players page reads them (read-only, `sharedBy` = owner). */
export const SHARED_PROFILES_KEY = 'logistack.sharedProfiles.v1';
const SHADOW_KEY = 'logistack.sync.v1';

export interface Account {
  email: string;
  plan: Plan;
  role: Role;
  limits: Limits;
  usage: Record<Kind, number>;
}

export interface SyncStatus {
  state: 'local' | 'syncing' | 'synced' | 'error';
  account: Account | null;
  /** The last problem: a plan limit ("The Free plan keeps 20 hands..."), or the network. */
  message?: string;
  /** Items the server refused (over a plan limit), by kind. */
  notSynced: Partial<Record<Kind, number>>;
}

let status: SyncStatus = { state: 'local', account: null, notSynced: {} };
const listeners = new Set<(s: SyncStatus) => void>();
const set = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
};
export const syncStatus = () => status;
export function onSyncStatus(l: (s: SyncStatus) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---- the local side ----------------------------------------------------------------------------

const rawSet = Storage.prototype.setItem;
/** Writes made by sync itself don't trigger another push. */
let quiet = false;

function readList(st: Store): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(st.key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (st.single) return parsed && typeof parsed === 'object' ? [{ ...(parsed as object), id: 'main' }] : [];
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]).filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(st: Store, list: Record<string, unknown>[]) {
  quiet = true;
  try {
    if (st.single) {
      const main = list.find((x) => x.id === 'main');
      if (main) {
        const { id: _id, ...rest } = main;
        void _id;
        localStorage.setItem(st.key, JSON.stringify(rest));
      }
    } else localStorage.setItem(st.key, JSON.stringify(list));
  } finally {
    quiet = false;
  }
}

function shadows(): Record<string, Shadow> {
  try {
    return (JSON.parse(localStorage.getItem(SHADOW_KEY) ?? '{}') as Record<string, Shadow>) ?? {};
  } catch {
    return {};
  }
}
function saveShadows(s: Record<string, Shadow>) {
  quiet = true;
  try {
    localStorage.setItem(SHADOW_KEY, JSON.stringify(s));
  } finally {
    quiet = false;
  }
}

// ---- the server side ---------------------------------------------------------------------------

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: true; body: T } | { ok: false; status: number; body: { error?: string; message?: string } }> {
  const r = await fetch(`/api/${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers }, credentials: 'same-origin' });
  const ct = r.headers.get('content-type') ?? '';
  const body = ct.includes('application/json') ? await r.json() : {};
  return r.ok ? { ok: true, body: body as T } : { ok: false, status: r.status, body: body as { error?: string; message?: string } };
}

/** Sends one kind's changes; returns the new shadow. Items over a plan limit stay local. */
async function pushKind(st: Store, push: Record<string, unknown>[], remove: string[], shadow: Shadow): Promise<Shadow> {
  const next = { ...shadow };
  let refused = 0;
  for (const x of push) {
    const data = st.single ? (({ id: _id, ...rest }) => (void _id, rest))(x) : x;
    const r = await call(`items/${st.kind}/${encodeURIComponent(String(x.id))}`, {
      method: 'PUT',
      body: JSON.stringify({ data, shared: st.kind === 'profile' && x.shared === true }),
    });
    if (r.ok) next[String(x.id)] = hashOf(x);
    else if (r.status === 403) {
      refused++;
      set({ message: r.body.message });
    } else throw new Error(r.body.message ?? `HTTP ${r.status}`);
  }
  for (const id of remove) {
    const r = await call(`items/${st.kind}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (r.ok || r.status === 404) delete next[id];
  }
  set({ notSynced: { ...status.notSynced, [st.kind]: refused } });
  return next;
}

/** Pull everything, merge, push what changed here. */
async function fullSync() {
  const all = shadows();
  for (const st of STORES) {
    const r = await call<{ items: ServerItem<Item>[]; shared?: { id: string; owner: string; data: Record<string, unknown> }[] }>(`items?kind=${st.kind}`);
    if (!r.ok) throw new Error(r.body.message ?? `HTTP ${r.status}`);
    const server = r.body.items.map((s) => (st.single && s.data ? { ...s, data: { ...(s.data as object), id: 'main' } as Item } : s));
    const local = readList(st) as unknown as Item[];
    const m = merge(local, server, all[st.kind] ?? {}, st.keep as ((x: Item) => boolean) | undefined);
    writeList(st, m.local as unknown as Record<string, unknown>[]);
    all[st.kind] = await pushKind(st, m.push as unknown as Record<string, unknown>[], m.remove, m.shadow);
    if (st.kind === 'profile') {
      quiet = true;
      try {
        localStorage.setItem(SHARED_PROFILES_KEY, JSON.stringify((r.body.shared ?? []).map((x) => ({ ...x.data, id: `shared:${x.owner}:${x.id}`, sharedBy: x.owner }))));
      } finally {
        quiet = false;
      }
    }
  }
  saveShadows(all);
}

/** Push only (after a local write): what changed since the shadow. */
async function pushChanges(kinds: Set<Kind>) {
  const all = shadows();
  for (const st of STORES) {
    if (!kinds.has(st.kind)) continue;
    const shadow = all[st.kind] ?? {};
    const local = readList(st).filter((x) => !st.keep || st.keep(x));
    const ids = new Set(local.map((x) => String(x.id)));
    const push = local.filter((x) => shadow[String(x.id)] !== hashOf(x));
    const remove = Object.keys(shadow).filter((id) => !ids.has(id));
    if (push.length || remove.length) all[st.kind] = await pushKind(st, push, remove, shadow);
  }
  saveShadows(all);
}

// ---- running it --------------------------------------------------------------------------------

let pending = new Set<Kind>();
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;

function schedule(kind: Kind) {
  if (!status.account) return;
  pending.add(kind);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), 1500);
}

async function flush() {
  if (running) await running;
  const kinds = pending;
  pending = new Set();
  if (!kinds.size) return;
  set({ state: 'syncing' });
  running = pushChanges(kinds)
    .then(() => set({ state: 'synced' }))
    .catch((e: unknown) => set({ state: 'error', message: e instanceof Error ? e.message : String(e) }))
    .finally(() => (running = null));
  await running;
}

/**
 * Start: find out who is logged in; if anyone, pull and merge, then watch for writes. Resolves
 * when the app can render (at the latest after `wait` ms - a slow server never blocks the app).
 */
export async function startSync(wait = 5000): Promise<void> {
  const work = (async () => {
    let me;
    try {
      me = await call<Omit<Account, 'limits'> & { limits?: Limits }>('me');
    } catch {
      return; // no server: local only
    }
    // not logged in, or no API at all (`npm run dev` answers /api/me with the app's page): local only
    if (!me.ok || typeof me.body.email !== 'string') return;
    const account: Account = { ...me.body, limits: me.body.limits ?? limitsFor(me.body.plan, me.body.role) };
    set({ account, state: 'syncing' });
    try {
      await fullSync();
      const again = await call<Account>('me');
      set({ state: 'synced', ...(again.ok ? { account: again.body } : {}) });
    } catch (e) {
      set({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
    // from now on, every write to a synced key is pushed a moment later
    Storage.prototype.setItem = function (key: string, value: string) {
      rawSet.call(this, key, value);
      if (quiet || this !== localStorage) return;
      const st = STORES.find((s) => s.key === key);
      if (st) schedule(st.kind);
    };
    window.addEventListener('pagehide', () => void flush());
  })();
  await Promise.race([work, new Promise((r) => setTimeout(r, wait))]);
}
