import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import { cardsFromComboIndex, parseCards, type Card } from '../cards';
import { evaluate } from '../evaluator';
import { CARD_HI, CARD_LO, evalPacked } from '../fastEval';
import { parseRange } from '../ranges/notation';
import { equityVsRange, monteCarloEquity } from './equity';
import { PreflopTable } from './preflopTable';

const cards = (text: string) => parseCards(text.split(' '));
const range = parseRange;

/** Slow and obvious: every combo, every runout, the readable evaluator. */
function bruteForce(hero: Card[], board: Card[], villainText: string): number {
  const w = range(villainText);
  let sum = 0;
  let weight = 0;
  for (let combo = 0; combo < 1326; combo++) {
    if (!(w[combo]! > 0)) continue;
    const v = cardsFromComboIndex(combo);
    const used = [...hero, ...board, ...v];
    if (new Set(used).size !== used.length) continue;
    const deck = Array.from({ length: 52 }, (_, i) => i).filter((c) => !used.includes(c));
    const runouts: Card[][] = [];
    const need = 5 - board.length;
    if (need === 0) runouts.push([]);
    if (need === 1) deck.forEach((c) => runouts.push([c]));
    if (need === 2) deck.forEach((c, i) => deck.slice(i + 1).forEach((d) => runouts.push([c, d])));
    let won = 0;
    for (const r of runouts) {
      const h = evaluate([...hero, ...board, ...r]);
      const s = evaluate([...v, ...board, ...r]);
      won += h > s ? 1 : h === s ? 0.5 : 0;
    }
    sum += w[combo]! * (won / runouts.length);
    weight += w[combo]!;
  }
  return sum / weight;
}

describe('exact equity after the flop', () => {
  test.each([
    ['Ah Kh', 'Qh Jh 2c', 'QQ, JJ, AQs, 22, T9s:0.5'],
    ['9s 8s', '7s 6d 2c Kh', 'AA, KK, AK, 76s, 22+'],
    ['Ah Ad', 'Ks Qs 7c 4d 2h', 'KK, AKs, QJs, 77'],
    ['5c 5d', 'Ac Kd 5h', 'AK, AA, KK, QJ'],
  ])('%s on %s vs %s matches brute force', (heroText, boardText, villain) => {
    const hero = cards(heroText);
    const board = cards(boardText);
    const r = equityVsRange(hero, board, range(villain));
    expect(r.method).toBe('exact');
    expect(r.equity).toBeCloseTo(bruteForce(hero, board, villain), 7); // per-combo results are 32-bit floats
  });

  test('card removal: villain combos using Hero or board cards drop out', () => {
    const r = equityVsRange(cards('Ah Kh'), cards('As 7d 2c'), range('AA, KK'));
    expect(r.combos).toBe(1 + 3); // AA: only Ad Ac left; KK: Kh is Hero's
    expect(Number.isNaN(r.vsCombo[0]!)).toBe(true);
  });

  test('a set on the river against an overpair always wins', () => {
    const r = equityVsRange(cards('7h 7d'), cards('7c Ks 2d 9h 4s'), range('AA'));
    expect(r.equity).toBe(1);
  });

  test('a full flop range is fast', () => {
    const t0 = performance.now();
    equityVsRange(cards('Ah Kh'), cards('Qh Jh 2c'), range('22+, A2+, K2+, Q2+, J2+, T2+, 92+, 82+, 72+, 62+, 52+, 42+, 32'));
    expect(performance.now() - t0).toBeLessThan(2000); // ~50 ms in a browser; the test runner is slower
  });

  test('rejects bad input', () => {
    expect(() => equityVsRange(cards('Ah Ah'), [], range('KK'))).toThrow();
    expect(() => equityVsRange(cards('Ah Kh'), cards('2c 3c'), range('KK'))).toThrow();
    expect(() => equityVsRange(cards('Ah Kh'), [], range('KK'))).toThrow(/preflop table/);
  });
});

describe('Monte Carlo', () => {
  test('heads-up on the flop agrees with the exact answer', () => {
    const hero = cards('9s 8s');
    const board = cards('7s 6d 2c');
    const exact = equityVsRange(hero, board, range('AA, KK, AK, 76s, 22+')).equity;
    const mc = monteCarloEquity(hero, board, [range('AA, KK, AK, 76s, 22+')], { samples: 60_000, seed: 7 });
    expect(Math.abs(mc.equity - exact)).toBeLessThan(4 * mc.stdError);
  });

  test('three-way shares add up to the whole pot', () => {
    const hands = ['AsAh', 'KsKh', 'QdQc'];
    const board = cards('Jc 7h 2s');
    const shares = hands.map((hero, i) => {
      const villains = hands.filter((_, j) => j !== i).map((h) => range(h));
      return monteCarloEquity(cards(`${hero.slice(0, 2)} ${hero.slice(2)}`), board, villains, { samples: 40_000, seed: i + 1 }).equity;
    });
    expect(Math.abs(shares.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(0.02);
    expect(shares[0]).toBeGreaterThan(0.8); // aces are far ahead on a jack-high flop
  });
});

describe('preflop table', () => {
  let table: PreflopTable;
  beforeAll(() => {
    const file = readFileSync(new URL('./preflop-hu.bin', import.meta.url));
    table = PreflopTable.fromBuffer(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
  });

  test('47,008 matchup classes', () => {
    expect(table.size).toBe(47008);
  });

  test.each([
    ['As Ah', 'Kd Kc', 0.82],
    ['Ah Kh', 'Qs Qd', 0.46],
    ['7c 2d', 'As Ah', 0.12],
    ['2c 2d', 'As Kh', 0.53],
  ])('%s vs %s ≈ %f (well-known figures)', (h, v, expected) => {
    const [a, b] = cards(h);
    const [c, d] = cards(v);
    expect(Math.abs(table.equity(a!, b!, c!, d!) - expected)).toBeLessThan(0.015);
  });

  test.each([['Ah Kh', 'Qs Qd'], ['9c 8c', 'As Kd'], ['Ts Td', 'Th 9h']])('%s vs %s equals a full enumeration of every board', (h, v) => {
    const [a, b] = cards(h);
    const [c, d] = cards(v);
    const deck = Array.from({ length: 52 }, (_, i) => i).filter((x) => ![a, b, c, d].includes(x));
    const [hl, hh] = [CARD_LO[a!]! | CARD_LO[b!]!, CARD_HI[a!]! | CARD_HI[b!]!];
    const [vl, vh] = [CARD_LO[c!]! | CARD_LO[d!]!, CARD_HI[c!]! | CARD_HI[d!]!];
    let won = 0;
    let boards = 0;
    for (let i = 0; i < 48; i++)
      for (let j = i + 1; j < 48; j++)
        for (let k = j + 1; k < 48; k++)
          for (let m = k + 1; m < 48; m++)
            for (let n = m + 1; n < 48; n++) {
              const five = [deck[i]!, deck[j]!, deck[k]!, deck[m]!, deck[n]!];
              let bl = 0;
              let bh = 0;
              for (const x of five) {
                bl |= CARD_LO[x]!;
                bh |= CARD_HI[x]!;
              }
              const hs = evalPacked(hl | bl, hh | bh);
              const vs = evalPacked(vl | bl, vh | bh);
              won += hs > vs ? 1 : hs === vs ? 0.5 : 0;
              boards++;
            }
    expect(boards).toBe(1712304);
    expect(Math.abs(table.equity(a!, b!, c!, d!) - won / boards)).toBeLessThan(1 / 65534);
  }, 30_000);

  test('both sides add up to 1, whatever the suits', () => {
    for (const [h, v] of [['Js Ts', 'Ah Kd'], ['8d 8c', '9d Tc'], ['Ks Qs', 'Kh Qh']]) {
      const [a, b] = cards(h!);
      const [c, d] = cards(v!);
      expect(table.equity(a!, b!, c!, d!) + table.equity(c!, d!, a!, b!)).toBeCloseTo(1, 12);
    }
  });

  test('same matchup with the suits relabelled gives the same equity', () => {
    const [a, b, c, d] = cards('Jh Th As Kd');
    const [e, f, g, h] = cards('Jc Tc Ad Ks');
    expect(table.equity(a!, b!, c!, d!)).toBe(table.equity(e!, f!, g!, h!));
  });

  test('a mirror matchup is exactly 50 %', () => {
    const [a, b, c, d] = cards('Jh Th Js Ts');
    expect(table.equity(a!, b!, c!, d!)).toBe(0.5);
    expect(table.equity(c!, d!, a!, b!)).toBe(0.5);
  });

  test('hero vs a range uses the table and removes blocked combos', () => {
    const r = equityVsRange(cards('As Ks'), [], range('AA, KK, QQ, AKo'), table);
    expect(r.method).toBe('table');
    expect(r.combos).toBe(3 + 3 + 6 + 6); // AA without A♠, KK without K♠, QQ, AKo without A♠x and xK♠
    expect(r.equity).toBeGreaterThan(0.3);
    expect(r.equity).toBeLessThan(0.45);
  });

  test('agrees with Monte Carlo for a range preflop', () => {
    const hero = cards('Jh Th');
    const villain = range('22+, A2s+, KTs+, QTs+, JTs, ATo+, KJo+');
    const exact = equityVsRange(hero, [], villain, table).equity;
    const mc = monteCarloEquity(hero, [], [villain], { samples: 60_000, seed: 3 });
    expect(Math.abs(mc.equity - exact)).toBeLessThan(4 * mc.stdError);
  });
});
