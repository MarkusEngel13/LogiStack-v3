import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { cardsFromComboIndex } from '../cards';
import { PreflopTable } from '../equity/preflopTable';
import { CELL_NAMES, CELLS, cellByName, combosOfCell } from './hands';
import { formatRange, parseRange } from './notation';
import { comboTotal } from './range';
import { HAND_RANKING, topCells, topPercent } from './ranking';

const text = (pct: number, minusPct?: number) => formatRange(topPercent(pct, minusPct));

describe('the hand ranking', () => {
  test('lists every hand once', () => {
    expect(HAND_RANKING).toHaveLength(CELLS);
    expect(new Set(HAND_RANKING).size).toBe(CELLS);
    expect(HAND_RANKING.every((c) => c >= 0 && c < CELLS)).toBe(true);
  });

  test('is the equity against a tight raise, with AK moved above JJ', () => {
    const file = readFileSync(new URL('../equity/preflop-hu.bin', import.meta.url));
    const table = PreflopTable.fromBuffer(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
    const raise = parseRange('77+, ATs+, KJs+, AQo+');
    const cards = Array.from({ length: 1326 }, (_, i) => cardsFromComboIndex(i));
    const equity = (cell: number) => {
      let sum = 0;
      for (const c of combosOfCell(cell)) {
        const [a, b] = cards[c]!;
        let e = 0;
        let n = 0;
        for (let v = 0; v < 1326; v++) {
          const [x, y] = cards[v]!;
          if (!(raise[v]! > 0) || a === x || a === y || b === x || b === y) continue;
          e += table.comboEquity(c, v);
          n++;
        }
        sum += e / n;
      }
      return sum / combosOfCell(cell).length;
    };
    const eq = Array.from({ length: CELLS }, (_, c) => equity(c));
    const byEquity = Array.from({ length: CELLS }, (_, c) => c).sort((a, b) => eq[b]! - eq[a]!);
    const names = byEquity.map((c) => CELL_NAMES[c]!);
    expect(names.slice(0, 6)).toEqual(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo']);
    const expected = ['AA', 'KK', 'QQ', 'AKs', 'AKo', 'JJ', ...names.slice(6)];
    expect(HAND_RANKING.map((c) => CELL_NAMES[c])).toEqual(expected);
  }, 30_000);

  test("the raise it is measured against is the ranking's own top 7 %", () => {
    expect(comboTotal(parseRange('77+, ATs+, KJs+, AQo+'))).toBe(96);
    expect(formatRange(topPercent((96 / 1326) * 100))).toBe('77+, ATs+, KJs+, AQo+');
  });
});

describe('top X %', () => {
  test('the quick ranges', () => {
    expect(text(3)).toBe('QQ+, AKs, AKo');
    expect(text(5)).toBe('99+, AQs+, AKo');
    expect(text(10)).toBe('55+, ATs+, KJs+, QJs, JTs, AJo+');
    expect(text(10, 3)).toBe('JJ-55, AQs-ATs, KJs+, QJs, JTs, AQo-AJo');
  });

  test('whole hands, never over the share', () => {
    for (const pct of [1, 2.5, 3, 5, 7.5, 10, 15, 20, 30, 50, 75]) {
      const combos = comboTotal(topPercent(pct));
      expect(combos).toBeLessThanOrEqual((pct / 100) * 1326);
      // the next hand would have gone over
      const next = HAND_RANKING[topCells(pct).length]!;
      expect(combos + combosOfCell(next).length).toBeGreaterThan((pct / 100) * 1326);
    }
  });

  test('a wider top holds the narrower one', () => {
    let before = topPercent(0);
    for (const pct of [2, 3, 5, 10, 20, 40, 60]) {
      const w = topPercent(pct);
      for (let c = 0; c < 1326; c++) if (before[c]! > 0) expect(w[c]).toBe(1);
      before = w;
    }
  });

  test('the ends', () => {
    expect(comboTotal(topPercent(0))).toBe(0);
    expect(comboTotal(topPercent(100))).toBe(1326);
    expect(comboTotal(topPercent(3, 10))).toBe(0);
    expect(comboTotal(topPercent(100, 3))).toBe(1326 - 34);
    expect(topCells(1).map((c) => CELL_NAMES[c])).toEqual(['AA', 'KK']);
    expect(topCells(3).at(-1)).toBe(cellByName('AKo'));
  });
});
