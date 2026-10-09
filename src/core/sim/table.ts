/**
 * A table of bots for the in-app runs (the player check and the exploit check): who sits where,
 * and hand i of the run - the button moves one seat a hand, stacks start at 100 BB, and hand i
 * is always dealt and played from the same seed, so a run can be split into batches, stopped
 * and resumed, and two runs that differ only in one seat see the same cards.
 */

import type { HandRecord } from '../hand/types';
import type { SeatStyle } from '../players/style';
import type { StoryCache } from '../motives/story';
import type { ChartChoice } from '../ranges/spot';
import { playHand, seeded } from './play';
import { addCounts, countHand, emptyCounts, type Counts } from './stats';

export interface SimSeat {
  name: string;
  /** Built-in type (for players with a style: its base type). */
  type: string;
  style?: SeatStyle;
}

export interface SimTable {
  seats: SimSeat[];
  /** Seed salt: the same salt deals the same cards. */
  seed: number;
}

export function simHand(t: SimTable, i: number): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: `sim-${t.seed}-${i}`,
    createdAt: '2026-01-01T00:00:00Z',
    table: { seats: t.seats.length, venue: 'home', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
    button: i % t.seats.length,
    players: t.seats.map((s, seat) => ({ seat, name: s.name, stack: 2500, playerType: s.type, ...(s.style ? { style: s.style } : {}) })),
    events: [],
  };
}

export interface SimBatch {
  /** Counts per seat ("0", "1", ...). */
  counts: Record<string, Counts>;
  /** Seat 0's result of each hand, in big blinds (for the exploit check's error bars). */
  nets: number[];
}

/** Hands [from, to) of a run. */
export function playSimHands(t: SimTable, from: number, to: number, charts: readonly ChartChoice[], cache: StoryCache = new Map()): SimBatch {
  const out: Record<string, Counts> = {};
  const nets: number[] = [];
  for (let i = from; i < to; i++) {
    if (cache.size > 2000) cache.clear();
    // the cards from their own stream: a seat that decides differently doesn't change the cards
    const p = playHand(simHand(t, i), charts, { rand: seeded(t.seed * 100_003 + i), dealRand: seeded(7_919 * i + 13), cache });
    const final = p.steps.at(-1)!;
    for (const [k, c] of countHand(final, (seat) => String(seat))) out[k] = addCounts(out[k] ?? emptyCounts(), c);
    nets.push((final.result?.net[0] ?? 0) / final.rules.bb);
  }
  return { counts: out, nets };
}

/** Adds one batch's counts to a running total. */
export function addBatch(total: Record<string, Counts>, batch: Record<string, Counts>): Record<string, Counts> {
  const out = { ...total };
  for (const [k, c] of Object.entries(batch)) out[k] = addCounts(out[k] ?? emptyCounts(), c);
  return out;
}
