/**
 * The quantum villain: nobody holds two cards until they must. Each player plays their whole
 * range, and every action after the flop keeps the part of the range that would take it, by the
 * motive model (decide.ts): a combo that raises 90 % of the time keeps 90 % of its weight after a
 * raise and 10 % after a call. What is left at any point of the hand is the player's range there.
 *
 * Heads-up only for now: an action taken with three or more players in leaves the range as it was.
 * Ranges start from the preflop charts (or a range you set in the Lab, which also resets a
 * player's range later in the hand: god mode). Everyone is narrowed the same way, Hero too: Hero's
 * range is what Hero's line tells the others.
 *
 * storyInput() reads the hand (cheap, main thread); runStory() runs the model (seconds, worker);
 * rangesAt() picks the ranges at any point from the result.
 */

import { bucketAll, type Bucket } from '../buckets';
import type { Card } from '../cards';
import { potTotal } from '../engine/replay';
import type { Street, TableState } from '../engine/state';
import type { HandRecord, SeatNo } from '../hand/types';
import { playerRange } from '../ranges/handRanges';
import { parseRange } from '../ranges/notation';
import type { Weights } from '../ranges/range';
import type { ChartChoice } from '../ranges/spot';
import { DEFAULT_BETS, DEFAULT_RAISES, decide, type OptionKind, type Situation } from './decide';
import { profileFor, type MotiveProfile } from './profile';

/** One action after the flop, as the model sees it. */
export interface StoryPoint {
  /** Index of the action in the hand's events (= the step before it). */
  event: number;
  street: Street;
  seat: SeatNo;
  /** The one other player still in; null with more players in (not narrowed yet). */
  opp: SeatNo | null;
  situation: Situation;
  taken: { kind: Exclude<OptionKind, 'fold'>; amount: number; allIn: boolean };
}

export interface StoryInput {
  /** Each player's range when the flop comes (chart for their preflop spot, or yours). */
  start: { seat: SeatNo; weights: Weights }[];
  /** Ranges you set later in the hand: they replace the player's range from that step on. */
  resets: { event: number; seat: SeatNo; weights: Weights }[];
  profiles: { seat: SeatNo; profile: MotiveProfile }[];
  points: StoryPoint[];
}

export interface StoryOption {
  label: string;
  kind: OptionKind;
  /** Share of the whole range that would take it. */
  share: number;
}

export interface StoryStep {
  event: number;
  street: Street;
  seat: SeatNo;
  board: Card[];
  /** What happened, in words ("Bet ⅓ pot", "Call"). */
  action: string;
  /** The model's menu with each option's share; `taken` is the action that happened. */
  options: StoryOption[];
  taken: number;
  /** Per bucket of the actor's range: combos before and the share it kept (took the action, size-tilted). */
  byBucket: Partial<Record<Bucket, { combos: number; took: number }>>;
  before: Weights;
  after: Weights;
  /** Why the range wasn't narrowed. */
  skipped?: 'multiway' | 'no range';
}

// ---- reading the hand ------------------------------------------------------------------------

/** Postflop the button acts last; the first seat after it acts first. */
const postflopOrder = (state: TableState, seat: SeatNo) => {
  const n = state.rules.tableSeats;
  return (((seat - state.button - 1) % n) + n) % n;
};

/** The defaults with the size nearest to the one taken replaced by it, so the taken size is on the menu. */
function withSize(defaults: readonly number[], taken: number): number[] {
  let nearest = 0;
  defaults.forEach((d, i) => {
    if (Math.abs(Math.log(d / taken)) < Math.abs(Math.log(defaults[nearest]! / taken))) nearest = i;
  });
  return defaults.map((d, i) => (i === nearest ? taken : d));
}

/** The model's view of a hand: start ranges, Lab resets, profiles and every postflop action. */
export function storyInput(hand: HandRecord, steps: readonly TableState[], charts: readonly ChartChoice[]): StoryInput | null {
  const flop = steps.findIndex((s) => s.board.length >= 3);
  if (flop < 0) return null;
  const atFlop = steps[flop]!;
  const live = atFlop.seats.filter((s) => s.dealtIn && !s.folded);
  const start = live.map((s) => ({ seat: s.seat, weights: playerRange(hand, atFlop, flop, s.seat, charts).weights }));
  const profiles = live.map((s) => ({ seat: s.seat, profile: profileFor(s) }));
  const resets: StoryInput['resets'] = [];
  for (const n of hand.ranges ?? []) {
    if (n.fromEvent <= flop || n.fromEvent >= steps.length) continue;
    try {
      resets.push({ event: n.fromEvent, seat: n.seat, weights: parseRange(n.range) });
    } catch {
      // a broken note (hand-edited file): ignored, as playerRange does
    }
  }

  const points: StoryPoint[] = [];
  for (let i = flop; i < steps.length - 1; i++) {
    const before = steps[i]!;
    const after = steps[i + 1]!;
    let entry = null;
    for (let k = after.log.length - 1; k >= 0; k--) {
      const e = after.log[k]!;
      if (e.kind === 'action' && e.event === i) {
        entry = e;
        break;
      }
    }
    if (!entry || entry.kind !== 'action' || entry.action === 'fold') continue;
    const me = before.seats.find((s) => s.seat === entry.seat)!;
    const others = before.seats.filter((s) => s.dealtIn && !s.folded && s.seat !== me.seat);
    const opp = others.length === 1 ? others[0]! : null;
    const owed = Math.max(0, before.currentBet - me.streetBet);
    const toCall = Math.min(owed, me.stack);
    const pot = potTotal(before) - owed;
    const kind = entry.action;
    const situation: Situation = {
      board: [...before.board],
      pot,
      toCall,
      stack: me.stack,
      oppStack: opp?.stack ?? 0,
      bb: before.rules.bb,
      inPosition: opp ? postflopOrder(before, me.seat) > postflopOrder(before, opp.seat) : false,
    };
    if (owed === 0 && opp) {
      // the last bet or raise of the hand so far was the opponent's: they have the initiative
      for (let k = before.log.length - 1; k >= 0; k--) {
        const e = before.log[k]!;
        if (e.kind === 'action' && (e.action === 'bet' || e.action === 'raise')) {
          if (e.seat === opp.seat) situation.oppInitiative = true;
          break;
        }
      }
    }
    if (entry.allIn && (kind === 'bet' || kind === 'raise')) situation.allInAlways = true;
    else if (kind === 'bet' && pot > 0) situation.betSizes = withSize(DEFAULT_BETS, entry.added / pot);
    else if (kind === 'raise' && toCall > 0) situation.raiseSizes = withSize(DEFAULT_RAISES, entry.added / toCall);
    points.push({ event: i, street: entry.street, seat: me.seat, opp: opp?.seat ?? null, situation, taken: { kind, amount: entry.added, allIn: entry.allIn } });
  }
  return { start, resets, profiles, points };
}

// ---- running the model -----------------------------------------------------------------------

/** A short fingerprint of a range, for caches and keys. */
export function fingerprint(w: Weights): string {
  const u = new Uint32Array(w.buffer, w.byteOffset, w.length);
  let h = 2166136261;
  for (let i = 0; i < u.length; i++) {
    h ^= u[i]!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

type Narrowed = Pick<StoryStep, 'options' | 'taken' | 'byBucket' | 'after'>;
/** Decisions already made, by situation and ranges. */
export type StoryCache = Map<string, Narrowed>;

/**
 * How much the exact size tells, against the action alone: 0 = a bet is a bet whatever its size,
 * 1 = the model's size choice taken at its word. Mostly: sizes are a real tell (HHP), but players
 * pick them loosely and the model's size preferences are its least calibrated part.
 */
const SIZE_TELL = 0.75;

/**
 * Every postflop action through the model, in order. `cache` (kept by the caller between runs)
 * skips decisions already made with the same ranges, so entering one more action only costs one.
 */
export function runStory(input: StoryInput, cache?: StoryCache): StoryStep[] {
  const current = new Map(input.start.map((s) => [s.seat, s.weights]));
  const profiles = new Map(input.profiles.map((p) => [p.seat, p.profile]));
  const resets = [...input.resets].sort((a, b) => a.event - b.event);
  let r = 0;
  const out: StoryStep[] = [];

  for (const pt of input.points) {
    while (r < resets.length && resets[r]!.event <= pt.event) {
      current.set(resets[r]!.seat, resets[r]!.weights);
      r++;
    }
    const before = current.get(pt.seat);
    const action = pt.taken.allIn ? 'All-in' : pt.taken.kind.charAt(0).toUpperCase() + pt.taken.kind.slice(1);
    const base = { event: pt.event, street: pt.street, seat: pt.seat, board: pt.situation.board, action, options: [], taken: -1, byBucket: {} };
    if (!before) {
      out.push({ ...base, before: new Float32Array(1326), after: new Float32Array(1326), skipped: 'no range' });
      continue;
    }
    const oppRange = pt.opp !== null ? current.get(pt.opp) : undefined;
    if (pt.opp === null || !oppRange) {
      out.push({ ...base, before, after: before, skipped: pt.opp === null ? 'multiway' : 'no range' });
      continue;
    }
    const profile = profiles.get(pt.seat)!;
    const key = JSON.stringify([pt.situation, pt.taken, profile, fingerprint(before), fingerprint(oppRange)]);
    let n = cache?.get(key);
    if (!n) {
      n = narrow(profile, pt, before, oppRange);
      cache?.set(key, n);
    }
    current.set(pt.seat, n.after);
    out.push({ ...base, ...n, action: n.options[n.taken]!.label, before });
  }
  return out;
}

function narrow(profile: MotiveProfile, pt: StoryPoint, mine: Weights, opp: Weights): Narrowed {
  const d = decide(profile, pt.situation, mine, opp);
  let taken = -1;
  d.options.forEach((o, i) => {
    if (o.kind !== pt.taken.kind) return;
    const best = taken < 0 ? Infinity : Math.abs(d.options[taken]!.amount - pt.taken.amount);
    if (pt.taken.allIn ? o.allIn : Math.abs(o.amount - pt.taken.amount) < best) taken = i;
  });
  if (taken < 0) throw new Error(`No ${pt.taken.kind} option for event ${pt.event}`);

  // Each combo keeps its chance of the action (bet, raise, ...) at any size, tilted by how much it
  // likes the size taken: a soft size tell, never above the action's own chance.
  const same = d.options.flatMap((o, i) => (o.kind === d.options[taken]!.kind ? [i] : []));
  const n = same.length;
  const top = 1 - SIZE_TELL + SIZE_TELL * n;
  const after = new Float32Array(1326);
  const buckets = bucketAll(pt.situation.board);
  const acc: Partial<Record<Bucket, { combos: number; kept: number }>> = {};
  for (let c = 0; c < 1326; c++) {
    const w = mine[c]!;
    const pr = d.probs[taken]![c]!;
    const b = buckets[c];
    if (!(w > 0) || Number.isNaN(pr) || !b) continue;
    let kind = 0;
    for (const i of same) kind += d.probs[i]![c]!;
    const keep = n > 1 && kind > 0 ? (kind * (1 - SIZE_TELL + SIZE_TELL * n * (pr / kind))) / top : kind;
    after[c] = w * keep;
    const row = (acc[b] ??= { combos: 0, kept: 0 });
    row.combos += w;
    row.kept += w * keep;
  }
  const byBucket: Narrowed['byBucket'] = {};
  for (const [b, row] of Object.entries(acc) as [Bucket, { combos: number; kept: number }][]) {
    byBucket[b] = { combos: row.combos, took: row.combos > 0 ? row.kept / row.combos : 0 };
  }
  return {
    options: d.options.map((o, i) => ({ label: o.label, kind: o.kind, share: d.shares[i]! })),
    taken,
    byBucket,
    after,
  };
}

/** Each player's range at a step: the latest of their start range, your resets and the narrowings before it. */
export function rangesAt(input: StoryInput, steps: readonly StoryStep[], step: number): Map<SeatNo, Weights> {
  const out = new Map(input.start.map((s) => [s.seat, s.weights]));
  const at = new Map<SeatNo, number>(input.start.map((s) => [s.seat, -1]));
  for (const x of input.resets) {
    if (x.event <= step && x.event > (at.get(x.seat) ?? -1)) {
      out.set(x.seat, x.weights);
      at.set(x.seat, x.event);
    }
  }
  for (const s of steps) {
    // an action at step k comes after a range you set at step k
    if (s.event < step && !s.skipped && s.event >= (at.get(s.seat) ?? -1)) {
      out.set(s.seat, s.after);
      at.set(s.seat, s.event);
    }
  }
  return out;
}
