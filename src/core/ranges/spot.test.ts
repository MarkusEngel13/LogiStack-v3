import { describe, expect, test } from 'vitest';
import { replay } from '../engine/replay';
import { FIXTURES } from '../fixtures';
import { cellByName, combosOfCell } from './hands';
import { LIBRARY } from './library';
import { comboTotal, emptyChart } from './range';
import { pickChart, preflopSpot, spotRange, weightsFor, type ChartChoice } from './spot';

const CHARTS: ChartChoice[] = LIBRARY.map((r) => ({ ...r }));
const weightOf = (w: Float32Array, hand: string) => w[combosOfCell(cellByName(hand)!)[0]!];

describe('preflop spots from the action', () => {
  test('open, flat call, big blind call (9-seat table, 6 players)', () => {
    const s = replay(FIXTURES.multiwayShowdown, 6); // preflop done
    expect(preflopSpot(s, 2)).toMatchObject({ scenario: 'RFI', took: 'raise', position: 'LJ', story: 'opened from the LJ' });
    expect(preflopSpot(s, 4)).toMatchObject({ scenario: 'vs RFI MP', took: 'call', position: 'HJ', story: 'called an open from the LJ' });
    expect(preflopSpot(s, 0)).toMatchObject({ scenario: 'vs RFI MP', took: 'call', position: 'BB' });
  });

  test('squeeze, and the opener calling it', () => {
    const s = replay(FIXTURES.sidePots, 12); // 10-max: UTG opens, UTG+1 calls, SB shoves, ...
    expect(preflopSpot(s, 0)).toMatchObject({ scenario: 'Squeeze', took: 'raise', position: 'SB' });
    expect(preflopSpot(s, 2)).toMatchObject({ scenario: 'IP vs 3Bet', took: 'call', position: 'UTG', story: 'called a 3-bet from the SB' });
  });

  test('straddled pot: the first limper has no chart, the others are "vs Limp"', () => {
    const s = replay(FIXTURES.straddle72, 6); // straddle, two calls, two folds, the straddler checks
    expect(preflopSpot(s, 3)).toMatchObject({ scenario: null, took: 'any', story: 'limped from the CO' });
    expect(preflopSpot(s, 5)).toMatchObject({ scenario: 'vs Limp', took: 'call', story: 'limped behind' });
    expect(preflopSpot(s, 2)).toMatchObject({ scenario: 'vs Limp', took: 'check' });
  });
});

describe('charts for a spot', () => {
  test('the exact position when the library has it', () => {
    const lj = pickChart(CHARTS, 'RFI', 'LJ', 100)!;
    expect(lj.positions).toContain('LJ');
    expect(lj).toMatchObject({ stack: '100BB', env: 'Live' });
  });

  test('the nearest position otherwise, live before online, deep stacks get 200 BB charts', () => {
    const vsLimpHj = pickChart(CHARTS, 'vs Limp', 'HJ', 100)!;
    expect(vsLimpHj.positions).toContain('CO');
    const deep = pickChart(CHARTS, 'RFI', 'BTN', 220)!;
    expect(deep.stack).toBe('200BB');
    const normal = pickChart(CHARTS, 'RFI', 'BTN', 100)!;
    expect(normal.stack).toBe('100BB');
    expect(normal.env).toBe('Live');
  });

  test('your own chart wins over the library for the same spot', () => {
    const lib = pickChart(CHARTS, 'RFI', 'CO', 100)!;
    const mine = { ...lib, id: 'mine-1', label: 'My CO opens', mine: true };
    expect(pickChart([...CHARTS, mine], 'RFI', 'CO', 100)!.id).toBe('mine-1');
  });
});

describe('weights for what they did', () => {
  const chart = emptyChart();
  chart[cellByName('AA')!] = { raise: 100, call: 0, allin: 0 };
  chart[cellByName('AJs')!] = { raise: 25, call: 75, allin: 0 };

  test('raise, call, check (= every hand that did not raise), any', () => {
    expect(weightOf(weightsFor(chart, 'raise'), 'AJs')).toBe(0.25);
    expect(weightOf(weightsFor(chart, 'call'), 'AJs')).toBe(0.75);
    expect(weightOf(weightsFor(chart, 'check'), 'AA')).toBe(0);
    expect(weightOf(weightsFor(chart, 'check'), '72o')).toBe(1);
    expect(comboTotal(weightsFor(null, 'any'))).toBe(1326);
  });

  test('spotRange explains itself', () => {
    const s = replay(FIXTURES.multiwayShowdown, 6);
    const bb = spotRange(s, 0, CHARTS);
    expect(bb.explanation).toMatch(/^Called an open from the LJ: the calling hands of “Reg - vs RFI MP - BB/);
    expect(comboTotal(bb.weights)).toBeGreaterThan(50);
  });

  test('a chart that never flat-calls: every hand it plays on stands in', () => {
    const s = replay(FIXTURES.multiwayShowdown, 6);
    const hj = spotRange(s, 4, CHARTS); // nearest chart (CO vs an MP open) only 3-bets or folds
    expect(hj.explanation).toMatch(/never does that, so every hand it plays on/);
    expect(comboTotal(hj.weights)).toBeGreaterThan(20);
  });
});
