import { describe, expect, test } from 'vitest';
import { comboIndex, parseCard, parseCards } from '../cards';
import { CELL_NAMES, CELL_OF_COMBO, CELLS, cellByName, cellOfCards, comboCount, combosOfCell } from './hands';
import { chartPosition, findRanges, LIBRARY, PLAYER_TYPES, SCENARIOS, TEN_MAX_POSITIONS } from './library';
import { formatRange, parseRange, RangeSyntaxError } from './notation';
import { cellWeights, chartWeights, comboTotal, emptyChart, withoutCards } from './range';

const combos = (text: string) => comboTotal(parseRange(text));

describe('the 13x13 grid', () => {
  test('169 distinct hands covering all 1326 combos once', () => {
    expect(new Set(CELL_NAMES).size).toBe(CELLS);
    const seen = new Set<number>();
    for (let cell = 0; cell < CELLS; cell++) {
      const list = combosOfCell(cell);
      expect(list).toHaveLength(comboCount(cell));
      list.forEach((c) => seen.add(c));
    }
    expect(seen.size).toBe(1326);
  });

  test('chart layout: AA top left, suited above the diagonal (v2 "row-col" keys)', () => {
    expect(CELL_NAMES[0]).toBe('AA');
    expect(cellByName('AKs')).toBe(1); // "0-1"
    expect(cellByName('AKo')).toBe(13); // "1-0"
    expect(CELL_NAMES[168]).toBe('22');
    expect(CELL_NAMES[cellOfCards(parseCard('Kh'), parseCard('Ah'))]).toBe('AKs');
    expect(CELL_NAMES[CELL_OF_COMBO[comboIndex(parseCard('7c'), parseCard('2d'))]!]).toBe('72o');
  });
});

describe('range text', () => {
  test.each([
    ['AA', 6],
    ['AKs', 4],
    ['AKo', 12],
    ['AK', 16],
    ['TT+', 30],
    ['ATs+', 16],
    ['KTo+', 36],
    ['AT+', 64],
    ['99-66', 24],
    ['A5s-A2s', 16],
    ['KQs-87s', 24],
    ['AhKh', 1],
    ['KQo:0.5', 6],
    ['KQo:50', 6],
    ['22+, A2s+, KTs+, AJo+', 78 + 48 + 12 + 36],
    ['aks, tt+', 4 + 30],
    ['AA, AA:0.5', 3], // the later item wins
  ])('%s = %f combos', (text, expected) => {
    expect(combos(text)).toBeCloseTo(expected, 6);
  });

  test.each(['AKx', 'AA+s', 'A5s-K2s', 'ZZ', 'AsAs', 'AK:abc', 'AKs-A2o', 'A-K-Q'])('"%s" is rejected', (text) => {
    expect(() => parseRange(text)).toThrow(RangeSyntaxError);
  });

  test.each([
    '22+, A2s+, KTs+, AJo+',
    'TT-77, AQs-ATs, KJs, 76s, A5o',
    'QQ+, AKs, AKo:0.5',
  ])('formats back to the same compact text: %s', (text) => {
    expect(formatRange(parseRange(text))).toBe(text);
  });

  test('connector runs come back hand by hand (still valid text)', () => {
    expect(formatRange(parseRange('AA, KQs-JTs:0.25'))).toBe('AA, KQs:0.25, QJs:0.25, JTs:0.25');
  });

  test('round trip keeps every combo weight', () => {
    const text = '55+, A2s+, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, ATo+, KJo+, QJo:0.5, AhKd';
    const once = parseRange(text);
    expect(Array.from(parseRange(formatRange(once)))).toEqual(Array.from(once));
  });

  test('cells with some combos removed are written combo by combo', () => {
    const w = withoutCards(parseRange('AA, KK'), [parseCard('As')]);
    expect(formatRange(w)).toBe('KK, AhAd, AhAc, AdAc');
  });
});

describe('charts and weights', () => {
  test('action shares become combo weights', () => {
    const chart = emptyChart();
    chart[cellByName('AA')!] = { raise: 100, call: 0, allin: 0 };
    chart[cellByName('AJs')!] = { raise: 50, call: 50, allin: 0 };
    expect(comboTotal(chartWeights(chart, ['raise']))).toBe(6 + 2);
    expect(comboTotal(chartWeights(chart, ['call']))).toBe(2);
    expect(comboTotal(chartWeights(chart, ['raise', 'call', 'allin']))).toBe(10);
  });

  test('dead cards remove combos', () => {
    const w = withoutCards(parseRange('AA, AKs'), parseCards(['As', 'Kh']));
    expect(comboTotal(w)).toBe(3 + 2); // AA without the A♠: 3; AKs without A♠K♠ and A♥K♥: 2
    const cells = cellWeights(w);
    expect(cells[cellByName('AA')!]).toBeNull(); // mixed now
    expect(cells[cellByName('KK')!]).toBe(0);
  });
});

describe('library (v2 charts)', () => {
  test('60 charts with known scenarios and 10-max positions', () => {
    expect(LIBRARY).toHaveLength(60);
    expect(PLAYER_TYPES).toHaveLength(18);
    for (const r of LIBRARY) {
      expect(SCENARIOS).toContain(r.scenario);
      for (const p of r.positions) expect(TEN_MAX_POSITIONS).toContain(p);
      expect(r.chart).toHaveLength(CELLS);
      for (const mix of r.chart) expect(mix.raise + mix.call + mix.allin).toBeLessThanOrEqual(100);
    }
  });

  test('a known chart: BB vs an SB open defends 22 by calling', () => {
    const [bbVsSb] = findRanges({ scenario: 'vs RFI SB', position: 'BB', stack: '100BB' });
    expect(bbVsSb!.label).toBe('Reg - vs RFI SB - BB (100BB)');
    expect(bbVsSb!.chart[cellByName('22')!]).toEqual({ raise: 0, call: 100, allin: 0 });
  });

  test('live RFI charts cover every position from UTG to the SB', () => {
    const covered = findRanges({ scenario: 'RFI', stack: '100BB', env: 'Live' }).flatMap((r) => r.positions);
    expect(new Set(covered)).toEqual(new Set(['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN', 'SB']));
  });
});

describe('chart positions by players behind', () => {
  test.each([
    ['UTG', 9, 'UTG+1'],
    ['UTG+2', 9, 'UTG+3'],
    ['UTG', 10, 'UTG'],
    ['UTG', 8, 'UTG+2'],
    ['UTG+1', 8, 'UTG+3'],
    ['UTG', 7, 'UTG+3'],
    ['LJ', 6, 'LJ'],
    ['CO', 9, 'CO'],
    ['BB', 9, 'BB'],
  ])('%s at %i players → %s', (position, players, expected) => {
    expect(chartPosition(position, players)).toBe(expected);
  });
});
