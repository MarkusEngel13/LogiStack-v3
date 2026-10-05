import { describe, expect, test } from 'vitest';
import { legalActions, replay } from '../../core/engine/replay';
import { FIXTURES } from '../../core/fixtures';
import { chipUnit, sizePresets } from './sizing';

const presets = (rec: typeof FIXTURES.steal, upto: number) => {
  const s = replay(rec, upto);
  return sizePresets(s, legalActions(s)!, rec.table.blinds.sb).map((p) => [p.label, p.to]);
};

describe('bet sizing presets', () => {
  test('chip unit is the gcd of the blinds', () => {
    expect(chipUnit(100, 200)).toBe(100);
    expect(chipUnit(10, 25)).toBe(5);
    expect(chipUnit(0, 200)).toBe(200);
  });

  test('unopened preflop: multiples of the big blind', () => {
    expect(presets(FIXTURES.steal, 0)).toEqual([
      ['2×', 400],
      ['2.5×', 500],
      ['3×', 600],
      ['4×', 800],
    ]);
  });

  test('after a straddle: multiples of the straddle', () => {
    const straddled = { ...FIXTURES.steal, events: [{ type: 'straddle' as const, seat: 0, amount: 400 }] }; // UTG straddles €4
    expect(presets(straddled, 1).map(([, to]) => to)).toEqual([800, 1000, 1200, 1600]);
  });

  test('a short stack only gets the sizes below all-in', () => {
    // Dex has €10 behind facing Cal's €4 straddle: only 2× (€8) is left; the rest is the all-in button
    expect(presets(FIXTURES.straddle72, 1)).toEqual([['2×', 800]]);
  });

  test('facing a raise: 2.5× / 3× / 4× and a pot-size raise', () => {
    // Carl raised to €6; pot €9 (1 + 2 + 6); Dora to act: pot raise = 6 + 9 + 6 = €21
    expect(presets(FIXTURES.multiwayShowdown, 1)).toEqual([
      ['2.5×', 1500],
      ['3×', 1800],
      ['4×', 2400],
      ['Pot', 2100],
    ]);
  });

  test('betting after the flop: fractions of the pot, rounded to the chip unit', () => {
    // Pot €19 on the flop, unit €1
    expect(presets(FIXTURES.multiwayShowdown, 7)).toEqual([
      ['⅓ pot', 600],
      ['½ pot', 1000],
      ['¾ pot', 1400],
      ['Pot', 1900],
    ]);
  });

  test('when every size is all-in or more, only the all-in button is left', () => {
    // River: Hero has €114 behind, pot €389 - even a third of the pot is more than the stack
    expect(presets(FIXTURES.multiwayShowdown, 18)).toEqual([]);
  });
});
