/**
 * Subscription plans and what each may do: the one place limits live. The server enforces the
 * limits on what it stores (it can't be bypassed); the app reads the same table to show them.
 * Everything that only runs in the browser can be unlocked by a determined user, so the paid
 * value leans on what needs the server: sync, storage, sharing, stats runs.
 *
 * Prices are not here (they live with the payment provider); a plan is just a name and limits.
 */

export const PLANS = ['free', 'premium', 'pro'] as const;
export type Plan = (typeof PLANS)[number];
export type Role = 'user' | 'editor' | 'admin';

/** What the server stores per user, by item kind. */
export const KINDS = ['hand', 'player', 'profile', 'range', 'settings', 'fishy', 'quiz'] as const;
export type Kind = (typeof KINDS)[number];

export interface Limits {
  /** Saved items per kind; null = unlimited. */
  items: Record<Kind, number | null>;
  /** May share own profiles with everyone. */
  shareProfiles: boolean;
  /** Size explorer, "what happens if", EV tables (browser features: shown, not enforced). */
  explorer: boolean;
  /** Stats reports for own players. */
  stats: boolean;
  /** Quizzes: practise any quiz at will (without it: only the day's set of ten). */
  quizPractice: boolean;
  /** "Consider this": pieces of advice shown per moment of a hand (from the playbook on the server). */
  advicePerSpot: number;
}

export const LIMITS: Record<Plan, Limits> = {
  free: {
    // quiz: your levels and missed questions, the history, today (and a spare day or two)
    items: { hand: 20, player: 3, profile: 2, range: 3, settings: 1, fishy: 50, quiz: 10 },
    shareProfiles: false,
    explorer: false,
    stats: false,
    quizPractice: false,
    advicePerSpot: 1,
  },
  premium: {
    items: { hand: null, player: null, profile: null, range: null, settings: 1, fishy: null, quiz: null },
    shareProfiles: false,
    explorer: true,
    stats: false,
    quizPractice: true,
    advicePerSpot: 3,
  },
  pro: {
    items: { hand: null, player: null, profile: null, range: null, settings: 1, fishy: null, quiz: null },
    shareProfiles: true,
    explorer: true,
    stats: true,
    quizPractice: true,
    advicePerSpot: 3,
  },
};

export const PLAN_LABELS: Record<Plan, string> = { free: 'Free', premium: 'Premium', pro: 'Pro' };

/** Admins and editors get everything regardless of plan. */
export function limitsFor(plan: Plan, role: Role = 'user'): Limits {
  return role === 'user' ? LIMITS[plan] : LIMITS.pro;
}

export type Denied = { ok: false; reason: 'limit' | 'plan'; message: string };

/** May this user save one more item of a kind (`count` = how many they have now)? */
export function canSave(plan: Plan, role: Role, kind: Kind, count: number, isNew: boolean): { ok: true } | Denied {
  const max = limitsFor(plan, role).items[kind];
  if (!isNew || max === null || count < max) return { ok: true };
  return { ok: false, reason: 'limit', message: `The ${PLAN_LABELS[plan]} plan keeps ${max} ${kind}${max === 1 ? '' : 's'}. Upgrade to keep more.` };
}

/** May this user share a profile with everyone? */
export function canShare(plan: Plan, role: Role): { ok: true } | Denied {
  return limitsFor(plan, role).shareProfiles ? { ok: true } : { ok: false, reason: 'plan', message: 'Sharing profiles is part of the Pro plan.' };
}

export const isPlan = (x: unknown): x is Plan => typeof x === 'string' && (PLANS as readonly string[]).includes(x);
export const isKind = (x: unknown): x is Kind => typeof x === 'string' && (KINDS as readonly string[]).includes(x);

/** The quiz items there are (ui/quiz/quizStore): `state` (levels, missed questions), `history` (a line a day), `day:2026-10-10`. */
export const isQuizItemId = (id: string) => /^(state|history|day:\d{4}-\d{2}-\d{2})$/.test(id);
