/**
 * A plain preflop strength order for the 169 starting hands (Bill Chen's formula), and each
 * hand's place in it as a share of all combos: 0 = the best, 1 = the worst. Used to widen or
 * narrow a chart for looser or tighter players (a whale plays the chart and then some).
 */

import { CELLS, cellKind, cellRanks, comboCount } from './hands';

/** Chen points of a cell: high card, pairs doubled, suited +2, gaps cost, connected low cards +1. */
export function chenPoints(cell: number): number {
  const [hi, lo] = cellRanks(cell); // 12 = ace .. 0 = deuce
  const card = (r: number) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  const kind = cellKind(cell);
  if (kind === 'pair') return Math.max(5, card(hi) * 2);
  let p = card(hi);
  if (kind === 'suited') p += 2;
  const gap = hi - lo - 1;
  p -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 10) p += 1; // both below a queen
  return Math.ceil(p);
}

/** Each cell's place among all 1326 combos, best first: the share of combos at least as strong (0..1). */
export const CELL_PERCENTILE: Float32Array = (() => {
  const order = Array.from({ length: CELLS }, (_, c) => c).sort((a, b) => chenPoints(b) - chenPoints(a) || comboCount(a) - comboCount(b));
  const out = new Float32Array(CELLS);
  let before = 0;
  for (const c of order) {
    out[c] = (before + comboCount(c) / 2) / 1326;
    before += comboCount(c);
  }
  return out;
})();
