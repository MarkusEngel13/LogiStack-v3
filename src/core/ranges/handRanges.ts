/**
 * Which range a player has at a point of a hand: the latest one you set in the Lab up to that
 * point, otherwise the chart for their preflop spot (spot.ts).
 */

import type { TableState } from '../engine/state';
import type { HandRecord, RangeNote, SeatNo } from '../hand/types';
import { parseRange } from './notation';
import type { Weights } from './range';
import { spotRange, type ChartChoice, type SpotRange } from './spot';

export interface PlayerRange {
  seat: SeatNo;
  weights: Weights;
  /** Set by you in the Lab (and from which step), or from the chart for the spot. */
  note: RangeNote | null;
  auto: SpotRange;
  explanation: string;
}

/** Your latest range for this player at or before `step`. */
export function noteAt(notes: readonly RangeNote[] | undefined, seat: SeatNo, step: number): RangeNote | null {
  let best: RangeNote | null = null;
  for (const n of notes ?? []) {
    if (n.seat === seat && n.fromEvent <= step && (!best || n.fromEvent >= best.fromEvent)) best = n;
  }
  return best;
}

/** Set (or replace) a range at a step. */
export const withNote = (notes: readonly RangeNote[] | undefined, note: RangeNote): RangeNote[] => [
  ...(notes ?? []).filter((n) => !(n.seat === note.seat && n.fromEvent === note.fromEvent)),
  note,
];

/** Remove the range set at exactly this step, so the earlier one (or the chart) applies again. */
export const withoutNote = (notes: readonly RangeNote[] | undefined, seat: SeatNo, step: number): RangeNote[] =>
  (notes ?? []).filter((n) => !(n.seat === seat && n.fromEvent === step));

/** After entering a new event at `cursor`, ranges set later belonged to the old branch. */
export const notesBefore = (notes: readonly RangeNote[] | undefined, cursor: number): RangeNote[] =>
  (notes ?? []).filter((n) => n.fromEvent <= cursor);

export function playerRange(hand: HandRecord, state: TableState, step: number, seat: SeatNo, charts: readonly ChartChoice[]): PlayerRange {
  const auto = spotRange(state, seat, charts);
  const note = noteAt(hand.ranges, seat, step);
  if (note) {
    try {
      return { seat, weights: parseRange(note.range), note, auto, explanation: 'Your range for this player.' };
    } catch {
      // a broken note (hand-edited file): fall back to the chart
    }
  }
  return { seat, weights: auto.weights, note: null, auto, explanation: auto.explanation };
}
