/**
 * The quantum villain: nobody holds two cards until they must. Each player plays their whole
 * range, and every action after the flop keeps the part of the range that would take it, by the
 * motive model (decide.ts): a combo that raises 90 % of the time keeps 90 % of its weight after a
 * raise and 10 % after a call. What is left at any point of the hand is the player's range there.
 *
 * Multiway too: the actor decides against everyone else still in (decide.ts), and each player
 * reads each other player's range in their own way (range reading). Ranges start from the preflop charts (or a range you set in the Lab, which also resets a
 * player's range later in the hand: god mode). Everyone is narrowed the same way, Hero too: Hero's
 * range is what Hero's line tells the others.
 *
 * storyInput() reads the hand (cheap, main thread); runStory() runs the model (seconds, worker);
 * rangesAt() picks the ranges at any point from the result.
 */

import { bucketAll, type Bucket } from '../buckets';
import type { Card } from '../cards';
import { potTotal } from '../engine/replay';
import type { SeatState, Street, TableState } from '../engine/state';
import type { HandRecord, SeatNo } from '../hand/types';
import { playerRange } from '../ranges/handRanges';
import { parseRange } from '../ranges/notation';
import type { Weights } from '../ranges/range';
import type { ChartChoice } from '../ranges/spot';
import { DEFAULT_BETS, DEFAULT_RAISES, OPP_BETS, decide, oppBetsOn, type Decision, type Motives, type OptionKind, type Situation } from './decide';
import { profileFor, type MotiveProfile } from './profile';

/** One action after the flop, as the model sees it. */
export interface StoryPoint {
  /** Index of the action in the hand's events (= the step before it). */
  event: number;
  street: Street;
  seat: SeatNo;
  /** Everyone else still in. */
  opps: SeatNo[];
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

/** One bucket of the actor's range at one action. */
export interface BucketStory {
  /** Combos before the action. */
  combos: number;
  /** Share it kept: took the action (size-tilted). */
  took: number;
  /** Each option's score parts (the weighted motives, pots), averaged over the bucket: the why. */
  parts: Motives[];
  /** Average share of next cards that bite into its lead (0 on the river). */
  bites: number;
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
  /** Per bucket of the actor's range: combos, share kept, and why. */
  byBucket: Partial<Record<Bucket, BucketStory>>;
  /** Possible next cards for a hand (47 on the flop, 46 on the turn, 0 on the river). */
  nextCards: number;
  before: Weights;
  after: Weights;
  /** Observer seat → the actor's range after the action as that player sees it (their range reading). */
  seen: Record<number, Weights>;
  /** Why the range wasn't narrowed. */
  skipped?: 'no range';
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

/**
 * The model's view of one decision: the situation of `seat` in `state` (pot before the bet faced,
 * chips to call, stacks, position, who has the initiative, who is still to act behind) and
 * everyone else still in.
 */
export function situationOf(state: TableState, seat: SeatNo): { situation: Situation; opps: SeatState[] } {
  const me = state.seats.find((s) => s.seat === seat)!;
  const opps = state.seats.filter((s) => s.dealtIn && !s.folded && s.seat !== me.seat);
  const owed = Math.max(0, state.currentBet - me.streetBet);
  const situation: Situation = {
    board: [...state.board],
    pot: potTotal(state) - owed,
    toCall: Math.min(owed, me.stack),
    stack: me.stack,
    oppStack: Math.max(0, ...opps.map((o) => o.stack)),
    bb: state.rules.bb,
    // in position = acts after everyone else
    inPosition: opps.length > 0 && opps.every((o) => postflopOrder(state, me.seat) > postflopOrder(state, o.seat)),
  };
  if (owed > 0) {
    // players who still have to match the bet after this one
    const behind = opps.filter((o) => !o.allIn && o.streetBet < state.currentBet).length;
    if (behind > 0) situation.behind = behind;
    // their own bet got raised (a check-raise, a re-raise)
    if (me.streetBet > 0 && state.street !== 'preflop') situation.facingRaise = true;
  } else if (opps.length > 0) {
    // the last bet or raise of the hand so far was someone else's: they have the initiative
    for (let k = state.log.length - 1; k >= 0; k--) {
      const e = state.log[k]!;
      if (e.kind === 'action' && (e.action === 'bet' || e.action === 'raise')) {
        if (opps.some((o) => o.seat === e.seat)) {
          situation.oppInitiative = true;
          // after a card that changed the nuts they expect the bettor to check
          if (oppBetsOn(state.board) !== OPP_BETS) situation.oppBets = oppBetsOn(state.board);
        }
        break;
      }
    }
  }
  return { situation, opps };
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
    const { situation, opps } = situationOf(before, entry.seat);
    const { pot, toCall } = situation;
    const kind = entry.action;
    if (entry.allIn && (kind === 'bet' || kind === 'raise')) situation.allInAlways = true;
    else if (kind === 'bet' && pot > 0) situation.betSizes = withSize(DEFAULT_BETS, entry.added / pot);
    else if (kind === 'raise' && toCall > 0) situation.raiseSizes = withSize(DEFAULT_RAISES, entry.added / toCall);
    points.push({ event: i, street: entry.street, seat: entry.seat, opps: opps.map((o) => o.seat), situation, taken: { kind, amount: entry.added, allIn: entry.allIn } });
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

type Narrowed = Pick<StoryStep, 'options' | 'taken' | 'byBucket' | 'after' | 'seen'>;
/** Decisions already made, by situation and ranges. */
export type StoryCache = Map<string, Narrowed>;

/**
 * How much the exact size tells, against the action alone: 0 = a bet is a bet whatever its size,
 * 1 = the model's size choice taken at its word. Mostly: sizes are a real tell (HHP), but players
 * pick them loosely and the model's size preferences are its least calibrated part.
 */
export const SIZE_TELL = 0.75;

/**
 * Every postflop action through the model, in order. `cache` (kept by the caller between runs)
 * skips decisions already made with the same ranges, so entering one more action only costs one.
 */
export function runStory(input: StoryInput, cache?: StoryCache): StoryStep[] {
  // each player's range as the model has it, and as each other player sees it ("observer>actor")
  const current = new Map(input.start.map((s) => [s.seat, s.weights]));
  const seen = new Map<string, Weights>();
  const seats = input.start.map((s) => s.seat);
  const setAll = (seat: SeatNo, w: Weights) => {
    current.set(seat, w);
    for (const o of seats) if (o !== seat) seen.set(`${o}>${seat}`, w);
  };
  for (const s of input.start) setAll(s.seat, s.weights);
  const profiles = new Map(input.profiles.map((p) => [p.seat, p.profile]));
  const resets = [...input.resets].sort((a, b) => a.event - b.event);
  let r = 0;
  const out: StoryStep[] = [];

  for (const pt of input.points) {
    while (r < resets.length && resets[r]!.event <= pt.event) {
      setAll(resets[r]!.seat, resets[r]!.weights);
      r++;
    }
    const before = current.get(pt.seat);
    const action = pt.taken.allIn ? 'All-in' : pt.taken.kind.charAt(0).toUpperCase() + pt.taken.kind.slice(1);
    const nextCards = pt.situation.board.length < 5 ? 50 - pt.situation.board.length : 0;
    const base = { event: pt.event, street: pt.street, seat: pt.seat, board: pt.situation.board, action, options: [], taken: -1, byBucket: {}, nextCards };
    // the others' ranges as the actor sees them, and the actor's as each of them sees it
    const oppRanges = pt.opps.map((o) => seen.get(`${pt.seat}>${o}`));
    if (!before || pt.opps.length === 0 || oppRanges.some((x) => !x)) {
      const b = before ?? new Float32Array(1326);
      out.push({ ...base, before: b, after: b, seen: {}, skipped: 'no range' });
      continue;
    }
    const observers = pt.opps.map((o) => ({ seat: o, seen: seen.get(`${o}>${pt.seat}`) ?? before, reading: profiles.get(o)?.rangeReading ?? 1 }));
    const profile = profiles.get(pt.seat)!;
    const key = JSON.stringify([
      pt.situation,
      pt.taken,
      profile,
      fingerprint(before),
      oppRanges.map((x) => fingerprint(x!)),
      observers.map((o) => [o.seat, o.reading, fingerprint(o.seen)]),
    ]);
    let n = cache?.get(key);
    if (!n) {
      n = narrow(profile, pt, before, oppRanges as Weights[], observers);
      cache?.set(key, n);
    }
    current.set(pt.seat, n.after);
    for (const [o, w] of Object.entries(n.seen)) seen.set(`${o}>${pt.seat}`, w);
    out.push({ ...base, ...n, action: n.options[n.taken]!.label, before });
  }
  return out;
}

/**
 * How much of each combo's weight an action keeps: its chance of the action (bet, raise, ...) at
 * any size, tilted by how much it likes the size taken - a soft size tell, never above the
 * action's own chance. NaN where the combo isn't in the decision.
 */
export function keeper(d: Decision, taken: number, tell = SIZE_TELL): (combo: number) => number {
  const same = d.options.flatMap((o, i) => (o.kind === d.options[taken]!.kind ? [i] : []));
  const n = same.length;
  const top = 1 - tell + tell * n;
  return (c) => {
    const pr = d.probs[taken]![c]!;
    if (Number.isNaN(pr)) return NaN;
    let kind = 0;
    for (const i of same) kind += d.probs[i]![c]!;
    return n > 1 && kind > 0 ? (kind * (1 - tell + tell * n * (pr / kind))) / top : kind;
  };
}

/**
 * One action: the decision of the actor's range (against the others' ranges as the actor sees
 * them), the range kept, and the range as each other player sees it after (`reading` = how much
 * they read actions: the kept share counts that much, the rest stays as it was).
 */
function narrow(
  profile: MotiveProfile,
  pt: StoryPoint,
  mine: Weights,
  opps: Weights[],
  observers: { seat: SeatNo; seen: Weights; reading: number }[],
): Narrowed {
  const d = decide(profile, pt.situation, mine, opps);
  let taken = -1;
  d.options.forEach((o, i) => {
    if (o.kind !== pt.taken.kind) return;
    const best = taken < 0 ? Infinity : Math.abs(d.options[taken]!.amount - pt.taken.amount);
    if (pt.taken.allIn ? o.allIn : Math.abs(o.amount - pt.taken.amount) < best) taken = i;
  });
  if (taken < 0) throw new Error(`No ${pt.taken.kind} option for event ${pt.event}`);

  const keepOf = keeper(d, taken);
  const after = new Float32Array(1326);
  const seen: Record<number, Weights> = {};
  for (const o of observers) {
    const w = new Float32Array(1326);
    for (let c = 0; c < 1326; c++) {
      const k = keepOf(c);
      if (o.seen[c]! > 0 && !Number.isNaN(k)) w[c] = o.seen[c]! * (1 - o.reading + o.reading * k);
    }
    seen[o.seat] = w;
  }
  const buckets = bucketAll(pt.situation.board);
  const blank = (): Motives => ({ gain: 0, loss: 0, fear: 0, trap: 0, tough: 0, embarrassment: 0, liking: 0 });
  const acc: Partial<Record<Bucket, { combos: number; kept: number; parts: Motives[]; bites: number }>> = {};
  for (let c = 0; c < 1326; c++) {
    const w = mine[c]!;
    const b = buckets[c];
    const keep = keepOf(c);
    if (!(w > 0) || Number.isNaN(keep) || !b) continue;
    after[c] = w * keep;
    const row = (acc[b] ??= { combos: 0, kept: 0, parts: d.options.map(blank), bites: 0 });
    row.combos += w;
    row.kept += w * keep;
    row.bites += w * d.facts.bites[c]!;
    d.explain(c).forEach((x, i) => {
      const part = row.parts[i]!;
      for (const k of Object.keys(part) as (keyof Motives)[]) part[k] += w * x.weighted[k];
    });
  }
  const byBucket: Narrowed['byBucket'] = {};
  for (const [b, row] of Object.entries(acc) as [Bucket, NonNullable<(typeof acc)[Bucket]>][]) {
    const avg = (x: number) => (row.combos > 0 ? x / row.combos : 0);
    byBucket[b] = {
      combos: row.combos,
      took: avg(row.kept),
      parts: row.parts.map((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, avg(v)])) as unknown as Motives),
      bites: avg(row.bites),
    };
  }
  return {
    options: d.options.map((o, i) => ({ label: o.label, kind: o.kind, share: d.shares[i]! })),
    taken,
    byBucket,
    after,
    seen,
  };
}

/**
 * Each player's range at a step: the latest of their start range, your resets and the narrowings
 * before it. `as: { observer }` = the ranges as that player sees them (their range reading); their
 * own is the model's.
 */
export function rangesAt(
  input: StoryInput,
  steps: readonly StoryStep[],
  step: number,
  as: 'model' | { observer: SeatNo } = 'model',
): Map<SeatNo, Weights> {
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
      out.set(s.seat, as !== 'model' && s.seat !== as.observer ? (s.seen[as.observer] ?? s.after) : s.after);
      at.set(s.seat, s.event);
    }
  }
  return out;
}
