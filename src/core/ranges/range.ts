/**
 * Two shapes of a range:
 *
 * - A **chart** is what the editor paints and the library stores: for each of the 169 cells, how
 *   often each action is taken, in percent (v2's model; fold is the rest).
 * - **Weights** are what equity works on: one number 0..1 per combo (1326), so single combos can
 *   be removed when their cards are on the board or in Hero's hand.
 */

import { comboIndex, type Card } from '../cards';
import { CELLS, CELL_OF_COMBO, combosOfCell } from './hands';

export interface ActionMix {
  raise: number;
  call: number;
  allin: number;
}
export type ChartAction = keyof ActionMix;
export const CHART_ACTIONS: readonly ChartAction[] = ['allin', 'raise', 'call'];

/** 169 cells in grid order (hands.ts). */
export type Chart = ActionMix[];

export const FOLD: Readonly<ActionMix> = { raise: 0, call: 0, allin: 0 };

export const emptyChart = (): Chart => Array.from({ length: CELLS }, () => ({ ...FOLD }));

/** Percent of the time a cell folds. */
export const foldOf = (mix: ActionMix) => Math.max(0, 100 - mix.raise - mix.call - mix.allin);

export type Weights = Float32Array;

export const emptyWeights = (): Weights => new Float32Array(1326);

/**
 * Combo weights of the hands that take the given actions: a cell that raises 50 % gives each of
 * its combos weight 0.5 for ['raise']. Use all three actions for "every hand that plays".
 */
export function chartWeights(chart: Chart, actions: readonly ChartAction[]): Weights {
  const w = emptyWeights();
  for (let cell = 0; cell < CELLS; cell++) {
    const mix = chart[cell]!;
    const share = Math.min(1, actions.reduce((sum, a) => sum + mix[a], 0) / 100);
    if (share > 0) for (const combo of combosOfCell(cell)) w[combo] = share;
  }
  return w;
}

/** A copy without the combos that use any of the dead cards (board, Hero's hand). */
export function withoutCards(weights: Weights, dead: readonly Card[]): Weights {
  const w = weights.slice();
  for (const d of dead) {
    for (let other = 0; other < 52; other++) {
      if (other !== d) w[comboIndex(d, other)] = 0;
    }
  }
  return w;
}

/** Number of combos, counting a combo of weight 0.5 as half. */
export function comboTotal(weights: Weights): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += weights[i]!;
  return sum;
}

/** Share of all 1326 starting hands, 0..1. */
export const rangeShare = (weights: Weights) => comboTotal(weights) / 1326;

/**
 * Per-cell weight when all of a cell's combos agree, or null for a cell whose combos differ
 * (some removed by dead cards, or set one by one).
 */
export function cellWeights(weights: Weights): (number | null)[] {
  const out: (number | null)[] = new Array(CELLS).fill(undefined);
  for (let combo = 0; combo < 1326; combo++) {
    const cell = CELL_OF_COMBO[combo]!;
    const w = weights[combo]!;
    if (out[cell] === undefined) out[cell] = w;
    else if (out[cell] !== null && out[cell] !== w) out[cell] = null;
  }
  return out;
}
