/**
 * The 13x13 grid of starting hands, laid out like every range chart: row and column 0 = ace,
 * 12 = deuce. The diagonal holds the pairs, above it the suited hands, below it the offsuit ones.
 *
 * A cell's index is row * 13 + col (0..168), its name "AA", "AKs" or "AKo". This is v2's
 * "row-col" key, so v2 range data maps one to one. Individual hands are combo indices 0..1325
 * (cards.ts), which is what equity works on.
 */

import { cardsFromComboIndex, cardToString, comboIndex, prettyCard, RANK_CHARS, rankOf, type Card } from '../cards';

export const CELLS = 169;

/** Card rank (0 = deuce .. 12 = ace) of a grid row or column. */
export const rankOfLine = (line: number) => 12 - line;
const lineOfRank = (rank: number) => 12 - rank;

export type CellKind = 'pair' | 'suited' | 'offsuit';

export function cellKind(cell: number): CellKind {
  const row = Math.floor(cell / 13);
  const col = cell % 13;
  return row === col ? 'pair' : row < col ? 'suited' : 'offsuit';
}

/** Ranks of a cell's two cards, higher first. */
export function cellRanks(cell: number): [number, number] {
  const a = rankOfLine(Math.floor(cell / 13));
  const b = rankOfLine(cell % 13);
  return a >= b ? [a, b] : [b, a];
}

/** The cell for two ranks (either order) and suitedness. */
export function cellOf(rankA: number, rankB: number, suited: boolean): number {
  const hi = Math.max(rankA, rankB);
  const lo = Math.min(rankA, rankB);
  const [r, c] = hi === lo || suited ? [lineOfRank(hi), lineOfRank(lo)] : [lineOfRank(lo), lineOfRank(hi)];
  return r * 13 + c;
}

export function cellName(cell: number): string {
  const [hi, lo] = cellRanks(cell);
  const kind = cellKind(cell);
  return RANK_CHARS[hi]! + RANK_CHARS[lo]! + (kind === 'pair' ? '' : kind === 'suited' ? 's' : 'o');
}

export const CELL_NAMES: readonly string[] = Array.from({ length: CELLS }, (_, i) => cellName(i));

const CELL_BY_NAME = new Map(CELL_NAMES.map((name, i) => [name, i]));

/** "AKs" → cell; undefined for anything else. */
export const cellByName = (name: string): number | undefined => CELL_BY_NAME.get(name);

/** Combos per cell: 6 for a pair, 4 suited, 12 offsuit. */
export const comboCount = (cell: number) => ({ pair: 6, suited: 4, offsuit: 12 })[cellKind(cell)];

/** The combo indices of a cell. */
export function combosOfCell(cell: number): number[] {
  const [hi, lo] = cellRanks(cell);
  const kind = cellKind(cell);
  const out: number[] = [];
  for (let s1 = 0; s1 < 4; s1++) {
    for (let s2 = 0; s2 < 4; s2++) {
      if (kind === 'pair' ? s2 <= s1 : kind === 'suited' ? s1 !== s2 : s1 === s2) continue;
      out.push(comboIndex(s1 * 13 + hi, s2 * 13 + lo));
    }
  }
  return out;
}

/** Cell of every combo index. */
export const CELL_OF_COMBO: Uint8Array = (() => {
  const table = new Uint8Array(1326);
  for (let cell = 0; cell < CELLS; cell++) for (const combo of combosOfCell(cell)) table[combo] = cell;
  return table;
})();

/** The cell two cards fall in. */
export const cellOfCards = (a: Card, b: Card) => CELL_OF_COMBO[comboIndex(a, b)]!;

/** A combo as people write it: higher rank first, a pair in suit order ("AhKh", "AsAd"; pretty: "A♥K♥"). */
export function comboLabel(combo: number, pretty = false): string {
  const [a, b] = cardsFromComboIndex(combo);
  const aFirst = rankOf(a) !== rankOf(b) ? rankOf(a) > rankOf(b) : a < b;
  const [x, y] = aFirst ? [a, b] : [b, a];
  const text = pretty ? prettyCard : cardToString;
  return text(x) + text(y);
}
