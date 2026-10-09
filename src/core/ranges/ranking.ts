/**
 * One preflop ranking of the 169 starting hands, best first, for "Top X %" ranges: the top 3 %
 * is QQ+, AK, the top 10 % a tight opening range, and "top 10 % minus top 3 %" the hands that
 * call a raise instead of re-raising it.
 *
 * The order is each hand's heads-up equity (from the preflop table) against a tight raise,
 * 77+, ATs+, KJs+, AQo+, which is also this ranking's own top 7 %. Against a raise, dominated
 * hands (A9o, KTo, Q9o) move down, and pairs and suited hands, which hit hard or miss, move up.
 * One change at the top: AK goes above JJ, the usual value range QQ+, AK (AK blocks AA and KK).
 * ranking.test.ts recomputes the order from the table.
 */

import { cellByName, comboCount, combosOfCell } from './hands';
import { emptyWeights, type Weights } from './range';

const ORDER = `
  AA KK QQ AKs AKo JJ TT 99 AQs AQo 88 AJs KQs ATs 77 KJs AJo 66 55 JTs QJs 44 KTs A9s QTs 33 KQo 22
  A5s T9s A8s A4s J9s ATo A3s K9s KJo A2s A7s Q9s A6s 98s T8s JTo J8s QJo K8s KTo QTo Q8s A9o K6s
  87s K5s K7s 97s K4s T9o 54s T7s A5o 76s 65s K3s 86s J9o A8o J7s 96s A4o K2s Q6s A3o Q5s T6s K9o
  J5s 75s Q7s J6s Q4s A2o Q9o 85s A7o J4s 53s 64s 95s A6o 98o Q3s J3s 43s T8o Q2s T5s T4s J2s J8o
  T3s 74s 84s K8o 63s T2s 52s 94s 93s Q8o 87o 42s K6o 97o 92s K5o K7o 32s 54o K4o 76o 65o T7o 73s
  86o 83s 82s K3o 96o J7o 62s K2o Q6o T6o Q5o 75o J5o 85o J6o 53o 64o Q7o Q4o J4o 95o 72s 43o Q3o
  J3o T5o T4o Q2o J2o 74o T3o 84o 63o 52o T2o 94o 93o 42o 92o 32o 73o 83o 82o 62o 72o
`;

/** The 169 cells (hands.ts), best first. */
export const HAND_RANKING: readonly number[] = ORDER.trim()
  .split(/\s+/)
  .map((name) => cellByName(name)!);

/**
 * The best hands while they stay within `pct` % of all 1326 combos. Whole hands only, and never
 * over: the top 3 % (39.8 combos) is QQ+, AK (34), because JJ would make it 40.
 */
export function topCells(pct: number): number[] {
  const limit = (pct / 100) * 1326 + 1e-9;
  const out: number[] = [];
  let combos = 0;
  for (const cell of HAND_RANKING) {
    combos += comboCount(cell);
    if (combos > limit) break;
    out.push(cell);
  }
  return out;
}

/**
 * Weights of the top `pct` % of hands without the top `minusPct` %: topPercent(10, 3) is a
 * calling range, the top 10 % without QQ+, AK (those would have re-raised).
 */
export function topPercent(pct: number, minusPct = 0): Weights {
  const w = emptyWeights();
  const skip = new Set(minusPct > 0 ? topCells(minusPct) : []);
  for (const cell of topCells(pct)) {
    if (!skip.has(cell)) for (const combo of combosOfCell(cell)) w[combo] = 1;
  }
  return w;
}
