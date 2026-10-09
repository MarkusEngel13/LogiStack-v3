/**
 * Which type a style is. First the family, from the two preflop sliders: tight or loose (Loose),
 * passive or aggressive (Preflop aggression) - the family of the built-in type nearest before the
 * flop. Then the postflop sliders choose within the family. So a tight player who c-bets every
 * flop and bluffs is a TAG who c-bets a lot, not a LAG (Jansen), and a loose raiser who c-bets
 * less is a LAG, not a TAG (Michel).
 *
 * A tie stays a tie ("between TAG and LAG"), never broken by list order. Unknown is never an
 * answer: it has a reg's sliders but means "no information".
 */

import { movedSliders, TYPE_SLIDERS, type SliderId, type Sliders, type StyleSettings } from './style';

export type Family = 'tight-passive' | 'tight-aggressive' | 'loose-passive' | 'loose-aggressive';

/** The built-in types by family: two in each, close together before the flop. */
export const TYPE_FAMILY: Record<string, Family> = {
  Reg: 'tight-aggressive',
  TAG: 'tight-aggressive',
  LAG: 'loose-aggressive',
  Maniac: 'loose-aggressive',
  Nit: 'tight-passive',
  'Weak-tight rec': 'tight-passive',
  Fish: 'loose-passive',
  Whale: 'loose-passive',
};

const POSTFLOP: readonly SliderId[] = ['postAggr', 'cbet', 'sticky', 'respect', 'bluffs'];

/** Closer than this counts as the same distance. */
const EPS = 1e-9;
/** A runner-up this near the best (in slider steps) is shown next to it. */
export const CLOSE = 1;

/** Distance before the flop: straight-line on Loose and Preflop aggression. */
const preflopDistance = (a: Sliders, b: Sliders) => Math.hypot(a.loose - b.loose, a.pfAggr - b.pfAggr);

/** Distance after the flop: the steps between the postflop sliders, added up. */
export const postflopDistance = (a: Sliders, b: Sliders) => POSTFLOP.reduce((d, id) => d + Math.abs(a[id] - b[id]), 0);

/** The family a style's preflop sliders put it in: the nearest built-in type's (both on a tie). */
export function familiesOf(s: Sliders): Family[] {
  let best = Infinity;
  let out: Family[] = [];
  for (const [type, family] of Object.entries(TYPE_FAMILY)) {
    const d = preflopDistance(s, TYPE_SLIDERS[type]!);
    if (d < best - EPS) {
      best = d;
      out = [family];
    } else if (d <= best + EPS && !out.includes(family)) out.push(family);
  }
  return out;
}

export interface TypeMatch<T> {
  /** The nearest: more than one on a tie. */
  best: T[];
  /** The next one when it is close (within CLOSE steps after the flop). */
  close?: T;
  /** The families his preflop sliders put him in. */
  families: Family[];
}

/** A candidate that only says "no information": the plain Unknown type. */
const isUnknown = (s: StyleSettings) => s.base === 'Unknown' && movedSliders(s).length === 0;

/**
 * The candidates (built-in types and your profiles) nearest a style: those in its family - a
 * candidate's family from its own sliders - by the postflop sliders.
 */
export function classify<T extends { settings: StyleSettings }>(s: StyleSettings, candidates: readonly T[]): TypeMatch<T> {
  const families = familiesOf(s.sliders);
  const real = candidates.filter((c) => !isUnknown(c.settings));
  const inFamily = real.filter((c) => familiesOf(c.settings.sliders).some((f) => families.includes(f)));
  const pool = (inFamily.length ? inFamily : real)
    .map((c) => ({ c, d: postflopDistance(s.sliders, c.settings.sliders) }))
    .sort((a, b) => a.d - b.d);
  if (pool.length === 0) return { best: [], families };
  const top = pool[0]!.d;
  const best = pool.filter((x) => x.d <= top + EPS).map((x) => x.c);
  const next = pool.find((x) => x.d > top + EPS);
  return { best, families, ...(next && next.d <= top + CLOSE + EPS ? { close: next.c } : {}) };
}
