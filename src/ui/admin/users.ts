import type { AdminUser } from '../../shared/api';
import { KINDS, limitsFor, type Kind } from '../../shared/plans';

/**
 * The admin dashboard's sums over the user list: the overview, the list's filters and order, the
 * "new" since the last visit, and dates in words. Pure, so they are tested without a server.
 */

export const DAY = 864e5;

/** What the server keeps per kind, as the dashboard names it. */
export const ITEM_LABEL: Record<Kind, string> = {
  hand: 'Hands',
  player: 'Players',
  profile: 'Profiles',
  range: 'Charts',
  settings: 'Settings',
  fishy: '“Fishy” marks',
  quiz: 'Quiz records',
};

const age = (iso: string | null, now: number) => (iso ? now - Date.parse(iso) : Infinity);

export const totalItems = (u: AdminUser) => Object.values(u.items).reduce((a, n) => a + (n ?? 0), 0);

export interface Overview {
  users: number;
  newWeek: number;
  activeWeek: number;
  /** Seen in the last 14 and 30 days: Cloudflare frees a seat after 2 weeks without a login. */
  active14: number;
  active30: number;
  /** On Premium or Pro. */
  paid: number;
  requests: number;
}

export function overview(users: AdminUser[], now: number): Overview {
  const within = (iso: string | null, days: number) => age(iso, now) <= days * DAY;
  return {
    users: users.length,
    newWeek: users.filter((u) => within(u.createdAt, 7)).length,
    activeWeek: users.filter((u) => within(u.seenAt, 7)).length,
    active14: users.filter((u) => within(u.seenAt, 14)).length,
    active30: users.filter((u) => within(u.seenAt, 30)).length,
    paid: users.filter((u) => u.plan !== 'free').length,
    requests: users.filter((u) => u.premiumRequest).length,
  };
}

/** Joins per week, oldest first; the last number is the current week (the last 7 days). */
export function joinsPerWeek(users: AdminUser[], now: number, weeks = 8): number[] {
  const out = new Array<number>(weeks).fill(0);
  for (const u of users) {
    const w = Math.floor(age(u.createdAt, now) / (7 * DAY));
    if (w >= 0 && w < weeks) out[weeks - 1 - w]!++;
  }
  return out;
}

export type UserFilter = 'all' | 'free' | 'premium' | 'pro' | 'requests' | 'new';
export type UserSort = 'newest' | 'seen' | 'items';

export function fits(u: AdminUser, filter: UserFilter, now: number): boolean {
  if (filter === 'all') return true;
  if (filter === 'requests') return !!u.premiumRequest;
  if (filter === 'new') return age(u.createdAt, now) <= 7 * DAY;
  return u.plan === filter;
}

/** The list as shown: search (email or note), filter, order. */
export function listView(users: AdminUser[], o: { query: string; filter: UserFilter; sort: UserSort }, now: number): AdminUser[] {
  const q = o.query.trim().toLowerCase();
  const by: Record<UserSort, (a: AdminUser, b: AdminUser) => number> = {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    seen: (a, b) => b.seenAt.localeCompare(a.seenAt),
    items: (a, b) => totalItems(b) - totalItems(a) || b.seenAt.localeCompare(a.seenAt),
  };
  return users
    .filter((u) => fits(u, o.filter, now) && (!q || u.email.toLowerCase().includes(q) || (u.note ?? '').toLowerCase().includes(q)))
    .sort(by[o.sort]);
}

/** Joined since the admin's last visit (never visited: this week); admins left out. */
export function isNew(u: AdminUser, lastVisit: string | null, now: number): boolean {
  if (u.role === 'admin') return false;
  return lastVisit ? u.createdAt > lastVisit : age(u.createdAt, now) <= 7 * DAY;
}

/** For the badge on the start page and in the menu. */
export function news(users: AdminUser[], lastVisit: string | null, now: number) {
  return { requests: users.filter((u) => u.premiumRequest).length, newUsers: users.filter((u) => isNew(u, lastVisit, now)).length };
}

export interface Usage {
  kind: Kind;
  count: number;
  /** null = no limit. */
  max: number | null;
}

/** Saved items per kind against the plan's limits (editors and admins: no limits). */
export const usage = (u: AdminUser): Usage[] => {
  const l = limitsFor(u.plan, u.role).items;
  return KINDS.map((kind) => ({ kind, count: u.items[kind] ?? 0, max: l[kind] }));
};

/** Kinds with more items than the plan keeps (a plan lowered later): new ones stay on their device. */
export const overLimit = (u: AdminUser) => usage(u).filter((x) => x.max !== null && x.count > x.max);

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", "3 weeks ago", "2 months ago". */
export function ago(iso: string, now: number): string {
  const ms = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 2) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  if (d < 730) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} years ago`;
}

/** "10 Oct 2026" in the reader's own date style. */
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** "10 Oct 2026, 14:05". */
export const timeOf = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
