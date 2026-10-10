import { describe, expect, it } from 'vitest';
import type { AdminUser } from '../../shared/api';
import { ago, DAY, isNew, joinsPerWeek, listView, news, overLimit, overview, totalItems, usage } from './users';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const at = (days: number) => new Date(NOW - days * DAY).toISOString();

const user = (email: string, o: Partial<AdminUser> = {}): AdminUser => ({
  email,
  plan: 'free',
  role: 'user',
  createdAt: at(30),
  seenAt: at(1),
  items: {},
  note: null,
  premiumRequest: null,
  ...o,
});

const USERS = [
  user('marius@x.com', { role: 'admin', createdAt: at(40), seenAt: at(0), items: { hand: 50 } }),
  user('gabi@x.com', { createdAt: at(2), seenAt: at(0.5), items: { hand: 20, player: 3 }, note: 'Gabi, Thursday game', premiumRequest: at(1) }),
  user('andrei@x.com', { plan: 'premium', createdAt: at(20), seenAt: at(10), items: { hand: 80 } }),
  user('mihai@x.com', { plan: 'pro', role: 'editor', createdAt: at(33), seenAt: at(20), items: { hand: 5 } }),
  user('vlad@x.com', { createdAt: at(60), seenAt: at(45), items: { hand: 26, range: 1 } }),
];

describe('admin overview', () => {
  it('counts users, the new and the active, the paying and the requests', () => {
    expect(overview(USERS, NOW)).toEqual({ users: 5, newWeek: 1, activeWeek: 2, active14: 3, active30: 4, paid: 2, requests: 1 });
  });

  it('counts joins per week, the current week last', () => {
    expect(joinsPerWeek(USERS, NOW, 8)).toEqual([0, 0, 1, 1, 0, 1, 0, 1]);
  });
});

describe('the user list', () => {
  const view = (o: Partial<Parameters<typeof listView>[1]>) => listView(USERS, { query: '', filter: 'all', sort: 'newest', ...o }, NOW).map((u) => u.email);

  it('sorts by joining, last seen and items', () => {
    expect(view({})).toEqual(['gabi@x.com', 'andrei@x.com', 'mihai@x.com', 'marius@x.com', 'vlad@x.com']);
    expect(view({ sort: 'seen' })[0]).toBe('marius@x.com');
    expect(view({ sort: 'items' })).toEqual(['andrei@x.com', 'marius@x.com', 'vlad@x.com', 'gabi@x.com', 'mihai@x.com']);
  });

  it('filters by plan, request and new', () => {
    expect(view({ filter: 'free' })).toEqual(['gabi@x.com', 'marius@x.com', 'vlad@x.com']);
    expect(view({ filter: 'pro' })).toEqual(['mihai@x.com']);
    expect(view({ filter: 'requests' })).toEqual(['gabi@x.com']);
    expect(view({ filter: 'new' })).toEqual(['gabi@x.com']);
  });

  it('searches email and note', () => {
    expect(view({ query: 'thursday' })).toEqual(['gabi@x.com']);
    expect(view({ query: 'ANDREI' })).toEqual(['andrei@x.com']);
  });
});

describe('new since the last visit', () => {
  it('counts joins after the visit, or this week when there was none, never admins', () => {
    expect(news(USERS, at(25), NOW)).toEqual({ requests: 1, newUsers: 2 });
    expect(news(USERS, null, NOW)).toEqual({ requests: 1, newUsers: 1 });
    expect(isNew(USERS[0]!, at(50), NOW)).toBe(false);
  });
});

describe('items against the plan', () => {
  it('shows every kind with the plan limit; editors have none', () => {
    const gabi = usage(USERS[1]!);
    expect(gabi.find((x) => x.kind === 'hand')).toEqual({ kind: 'hand', count: 20, max: 20 });
    expect(gabi.find((x) => x.kind === 'range')).toEqual({ kind: 'range', count: 0, max: 3 });
    expect(usage(USERS[3]!).every((x) => x.max === null || x.kind === 'settings')).toBe(true);
    expect(totalItems(USERS[4]!)).toBe(27);
  });

  it('finds kinds over the limit after a plan was lowered', () => {
    expect(overLimit(USERS[4]!).map((x) => x.kind)).toEqual(['hand']);
    expect(overLimit(USERS[1]!)).toEqual([]);
  });
});

describe('dates in words', () => {
  it('says how long ago', () => {
    const t = (ms: number) => ago(new Date(NOW - ms).toISOString(), NOW);
    expect(t(20_000)).toBe('just now');
    expect(t(5 * 60_000)).toBe('5 min ago');
    expect(t(3 * 3600_000)).toBe('3 h ago');
    expect(t(30 * 3600_000)).toBe('yesterday');
    expect(t(4 * DAY)).toBe('4 days ago');
    expect(t(21 * DAY)).toBe('3 weeks ago');
    expect(t(90 * DAY)).toBe('3 months ago');
  });
});
