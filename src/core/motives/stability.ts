/**
 * Solution stability (review item 39): is the best option of the EV table a safe exploit, or does
 * it flip as soon as the read is a little off? The EV comes from the model's read of the others -
 * their ranges and how they play - and those reads are guesses. So the same question is asked
 * again with each read nudged:
 *
 * - his range: preflop 10 % wider or narrower (the next hands of the preflop ranking added, or his
 *   weakest dropped); after the flop a little stronger or weaker (weight moved toward his best or
 *   his worst hands on this board). What the actor believes about him stays as it was: the
 *   question is "what if he really holds something else than I think".
 * - how he plays: calls more / less, raises more / less, respects big bets more / less, bluffs
 *   more / less (the motive weights behind those sliders, about 15 % either way).
 *
 * The answer: in how many of those the best option stays best, which nudges flip it and to what,
 * and - heads-up - how far his range can move before it flips ("holds until he's 20 % wider").
 * A line that flips on a small nudge is not a safe exploit.
 */

import type { Card } from '../cards';
import { evaluate } from '../evaluator';
import { cellOf } from '../ranges/hands';
import { HAND_RANKING } from '../ranges/ranking';
import { emptyWeights, type Weights } from '../ranges/range';
import { cardsFromComboIndex, rankOf, suitOf } from '../cards';
import type { MotiveProfile } from './profile';
import { actorDecision, exploreSizes, type SizeAnswer, type SizeOther, type SizeQuestion, type SizeRow } from './sizes';

export interface Nudge {
  label: string;
  kind: 'range' | 'style';
  /** The question with this read changed. */
  q: SizeQuestion;
}

export interface Flip {
  nudge: string;
  /** The option that is best then. */
  best: string;
  /** Only the size moved (bet ½ -> bet ¾): the same action, another amount. */
  sameAction: boolean;
}

export interface Stability {
  /** The best option with the reads as they are. */
  best: string;
  /** Its lead over the second best, in chips (this street). */
  margin: number;
  /** Nudges tried, in how many the best option stayed best, and in how many its action did (maybe another size). */
  of: number;
  held: number;
  heldAction: number;
  flips: Flip[];
  /** Heads-up: how far his range may move before the best option changes (percent; null = not within 30 %). */
  rangeLimit?: { wider: number | null; narrower: number | null; preflop: boolean };
}

// ---- reading the answer ------------------------------------------------------------------------------

/** The options with an EV, best first. */
export function ranked(a: SizeAnswer): SizeRow[] {
  return [...a.passive, ...a.rows].filter((r) => r.ev !== undefined && Number.isFinite(r.ev)).sort((x, y) => y.ev! - x.ev!);
}

/**
 * Options that are worth the same within half a chip count as one (two sizes that both shove);
 * the best "stays best" when the option at the top is still the same one or ties with it.
 */
function bestOf(a: SizeAnswer): { label: string; kind: SizeRow['kind']; rows: SizeRow[] } | null {
  const r = ranked(a);
  return r.length ? { label: r[0]!.label, kind: r[0]!.kind, rows: r } : null;
}

/** Bet and raise count as one action (aggressive), check, call and fold each their own. */
const actionOf = (kind: SizeRow['kind']) => (kind === 'bet' || kind === 'raise' ? 'aggressive' : kind);

function stillBest(a: SizeAnswer, label: string): boolean {
  const r = ranked(a);
  if (!r.length) return false;
  const mine = r.find((x) => x.label === label);
  return !!mine && r[0]!.ev! - mine.ev! < 0.5;
}

/** How many of the best options are compared under the nudges. */
const CONTENDERS = 3;

// ---- nudging a range ----------------------------------------------------------------------------------

const PREFLOP_RANK: Float32Array = (() => {
  // each combo's place in the preflop ranking, 0 = best .. 1 = worst
  const out = new Float32Array(1326);
  const n = HAND_RANKING.length;
  for (let c = 0; c < 1326; c++) {
    const [a, b] = cardsFromComboIndex(c);
    const cell = cellOf(rankOf(a), rankOf(b), suitOf(a) === suitOf(b));
    out[c] = HAND_RANKING.indexOf(cell) / (n - 1);
  }
  return out;
})();

/** Strength of each combo on this board, 0 = worst .. 1 = best (made hands; preflop: the ranking). */
function strengthOf(board: readonly Card[], dead: readonly Card[]): Float32Array {
  const out = new Float32Array(1326).fill(NaN);
  if (board.length < 3) {
    for (let c = 0; c < 1326; c++) out[c] = 1 - PREFLOP_RANK[c]!;
    return out;
  }
  const blocked = new Set([...board, ...dead]);
  const scores: { c: number; s: number }[] = [];
  for (let c = 0; c < 1326; c++) {
    const [a, b] = cardsFromComboIndex(c);
    if (blocked.has(a) || blocked.has(b)) continue;
    scores.push({ c, s: evaluate([a, b, ...board]) });
  }
  scores.sort((x, y) => x.s - y.s);
  scores.forEach(({ c }, i) => (out[c] = scores.length > 1 ? i / (scores.length - 1) : 0.5));
  return out;
}

/**
 * Preflop: `pct` % of all combos more (the next hands of the ranking, at full weight) or fewer
 * (his worst dropped). After the flop: weight tilted toward his strongest (pct > 0 = stronger)
 * or weakest hands on this board, by `pct` % at the ends.
 */
export function nudgeRange(w: Weights, pct: number, board: readonly Card[], dead: readonly Card[] = []): Weights {
  const out = emptyWeights();
  out.set(w);
  if (board.length < 3) {
    const blocked = new Set(dead);
    const free = (c: number) => {
      const [a, b] = cardsFromComboIndex(c);
      return !blocked.has(a) && !blocked.has(b);
    };
    let todo = (Math.abs(pct) / 100) * 1326;
    const order = Array.from({ length: 1326 }, (_, c) => c).sort((a, b) => PREFLOP_RANK[a]! - PREFLOP_RANK[b]!);
    if (pct > 0) {
      // add the next hands he doesn't play yet: from the middle of his range down (a calling
      // range without AA stays without AA - those he played another way)
      let half = 0;
      let sum = 0;
      for (let c = 0; c < 1326; c++) sum += out[c]!;
      let from = 0;
      for (const c of order) {
        half += out[c]!;
        if (half >= sum / 2) {
          from = PREFLOP_RANK[c]!;
          break;
        }
      }
      for (const c of order) {
        if (PREFLOP_RANK[c]! < from) continue;
        if (todo <= 0) break;
        if (!free(c) || out[c]! >= 1) continue;
        const add = Math.min(1 - out[c]!, todo);
        out[c] = out[c]! + add;
        todo -= add;
      }
    } else {
      for (let i = order.length - 1; i >= 0 && todo > 0; i--) {
        const c = order[i]!;
        if (out[c]! <= 0) continue;
        const cut = Math.min(out[c]!, todo);
        out[c] = out[c]! - cut;
        todo -= cut;
      }
    }
    return out;
  }
  const strength = strengthOf(board, dead);
  const t = pct / 100;
  for (let c = 0; c < 1326; c++) {
    if (!(w[c]! > 0)) continue;
    const s = strength[c]!;
    if (Number.isNaN(s)) continue;
    // stronger: the best hands keep their weight, the worst lose up to |t|; weaker the other way
    const factor = t > 0 ? 1 - t * (1 - s) : 1 + t * s;
    out[c] = w[c]! * Math.max(0, factor);
  }
  return out;
}

// ---- the nudges ---------------------------------------------------------------------------------------

const STYLE_NUDGES: { label: string; change: (p: MotiveProfile) => MotiveProfile }[] = [
  { label: 'calls more', change: (p) => ({ ...p, stickiness: p.stickiness * 1.15 + 0.03 }) },
  { label: 'calls less', change: (p) => ({ ...p, stickiness: p.stickiness * 0.85 }) },
  { label: 'raises more', change: (p) => ({ ...p, aggression: p.aggression * 1.15 + 0.03 }) },
  { label: 'raises less', change: (p) => ({ ...p, aggression: p.aggression * 0.85 }) },
  { label: 'respects big bets more', change: (p) => ({ ...p, respect: p.respect + 0.15 }) },
  { label: 'respects big bets less', change: (p) => ({ ...p, respect: p.respect - 0.15 }) },
  { label: 'bluffs more', change: (p) => ({ ...p, embarrassment: p.embarrassment * 0.85 }) },
  { label: 'bluffs less', change: (p) => ({ ...p, embarrassment: p.embarrassment * 1.15 + 0.03 }) },
];

const withOther = (q: SizeQuestion, i: number, o: SizeOther): SizeQuestion => ({ ...q, others: q.others.map((x, k) => (k === i ? o : x)) });

/** His range as the model has it, moved by pct; what the actor believes about him stays. */
function rangeNudge(q: SizeQuestion, i: number, pct: number): SizeQuestion {
  const o = q.others[i]!;
  const dead = [...(q.actor.cards ?? [])];
  return withOther(q, i, { ...o, seen: o.seen ?? o.range, range: nudgeRange(o.range, pct, q.situation.board, dead) });
}

const rangeWord = (preflop: boolean, pct: number) =>
  preflop ? `${Math.abs(pct)} % ${pct > 0 ? 'wider' : 'narrower'}` : `${Math.abs(pct)} % ${pct > 0 ? 'stronger' : 'weaker'}`;

/** Every nudge for every other player still in. */
export function nudges(q: SizeQuestion, names: Record<number, string> = {}): Nudge[] {
  const preflop = q.situation.board.length < 3;
  const multi = q.others.length > 1;
  const out: Nudge[] = [];
  q.others.forEach((o, i) => {
    // each label finishes "it flips if ...": "he calls more", "Gabi's range is 10 % wider"
    const name = names[o.seat] ?? `Seat ${o.seat + 1}`;
    const he = multi ? name : 'he';
    const his = multi ? `${name}'s` : 'his';
    for (const pct of [10, -10]) out.push({ label: `${his} range is ${rangeWord(preflop, pct)}`, kind: 'range', q: rangeNudge(q, i, pct) });
    for (const s of STYLE_NUDGES) out.push({ label: `${he} ${s.label}`, kind: 'style', q: withOther(q, i, { ...o, profile: s.change(o.profile) }) });
  });
  return out;
}

/**
 * The best option and how it holds under every nudge. `base` = the answer already worked out
 * for q (the EV table's), to save one run. `scan` (heads-up): how far his range may move.
 */
export function stability(
  q: SizeQuestion,
  opts: { base?: SizeAnswer; names?: Record<number, string>; scan?: boolean; onProgress?: (done: number, of: number) => void } = {},
): Stability | null {
  // what the actor believes stays the same in every nudge: his decision is worked out once
  const mine = actorDecision(q);
  const base = opts.base ?? exploreSizes(q, { mine });
  const top = bestOf(base);
  if (!top) return null;
  const margin = top.rows.length > 1 ? top.rows[0]!.ev! - top.rows[1]!.ev! : Infinity;
  // the contenders: the best options with the reads as they are (one far behind doesn't jump to the top on a small nudge)
  const only = new Set(top.rows.slice(0, CONTENDERS).map((r) => r.label));
  const ask = (x: SizeQuestion) => exploreSizes(x, { mine, only });
  const flips: Flip[] = [];
  const all = nudges(q, opts.names);
  const scans = (opts.scan ?? q.others.length === 1) && q.others.length === 1;
  const steps = all.length + (scans ? 6 : 0);
  let done = 0;
  for (const n of all) {
    const a = ask(n.q);
    opts.onProgress?.(++done, steps);
    if (!stillBest(a, top.label)) {
      const now = bestOf(a);
      flips.push({ nudge: n.label, best: now?.label ?? '–', sameAction: !!now && actionOf(now.kind) === actionOf(top.kind) });
    }
  }
  // the action flips first: those are the ones that matter
  flips.sort((x, y) => Number(x.sameAction) - Number(y.sameAction));
  const out: Stability = {
    best: top.label,
    margin,
    of: all.length,
    held: all.length - flips.length,
    heldAction: all.length - flips.filter((f) => !f.sameAction).length,
    flips,
  };
  if (scans) {
    const limit = (dir: 1 | -1): number | null => {
      for (const pct of [10, 20, 30]) {
        const flipped = !stillBest(ask(rangeNudge(q, 0, dir * pct)), top.label);
        opts.onProgress?.(++done, steps);
        if (flipped) return pct;
      }
      return null;
    };
    out.rangeLimit = { wider: limit(1), narrower: limit(-1), preflop: q.situation.board.length < 3 };
  }
  return out;
}

/**
 * One line for the badge. Stable = the best option stays best in every nudge (or only its size
 * moves); mostly stable = the action holds in 80 % of the nudges or more; fragile = less.
 */
export function stabilityLine(s: Stability): { tone: 'stable' | 'shaky' | 'fragile'; text: string; detail?: string } {
  const limit = rangeLimitText(s);
  if (s.flips.length === 0) return { tone: 'stable', text: `Stable: ${s.best} is best in all ${s.of} nudges`, detail: limit };
  const actionFlips = s.flips.filter((f) => !f.sameAction);
  if (actionFlips.length === 0) {
    const f = s.flips[0]!;
    return {
      tone: 'stable',
      text: `Stable: the action holds in all ${s.of} nudges; only the best size moves in ${s.flips.length} (→ ${f.best} if ${f.nudge})`,
      detail: limit,
    };
  }
  const f = actionFlips[0]!;
  const text = `${s.best} is best in ${s.held} of ${s.of} nudges · flips if ${f.nudge} (→ ${f.best})`;
  return s.heldAction / s.of >= 0.8 ? { tone: 'shaky', text: `Mostly stable: ${text}`, detail: limit } : { tone: 'fragile', text: `Fragile: ${text}`, detail: limit };
}

/** "His range may be 30 % wider or 20 % narrower before it flips" (heads-up scan). */
function rangeLimitText(s: Stability): string | undefined {
  const r = s.rangeLimit;
  if (!r) return undefined;
  const part = (pct: number | null, word: string) => (pct === null ? `even 30 % ${word}` : `up to ${pct === 10 ? 'under 10' : pct - 10} % ${word}`);
  const [up, down] = r.preflop ? ['wider', 'narrower'] : ['stronger', 'weaker'];
  if (r.wider === null && r.narrower === null) return `Holds even with his range 30 % ${up} or 30 % ${down}.`;
  return `Holds with his range ${part(r.wider, up)} and ${part(r.narrower, down)}.`;
}
