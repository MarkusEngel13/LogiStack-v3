import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import { cardsFromComboIndex, comboIndex, parseCards, type Card } from '../cards';
import { evaluate } from '../evaluator';
import { parseRange } from '../ranges/notation';
import { equityVsRange } from './equity';
import { monteCarloField, rangeVsRange } from './field';
import { PreflopTable } from './preflopTable';

const cards = (text: string) => parseCards(text.split(' '));

/** Slow and obvious: every pair of combos, every runout, the readable evaluator. */
function bruteForce(aText: string, bText: string, board: Card[]) {
  const a = parseRange(aText);
  const b = parseRange(bText);
  let win = 0;
  let tie = 0;
  let mass = 0;
  for (let i = 0; i < 1326; i++) {
    if (!(a[i]! > 0)) continue;
    for (let j = 0; j < 1326; j++) {
      if (!(b[j]! > 0)) continue;
      const used = [...cardsFromComboIndex(i), ...cardsFromComboIndex(j), ...board];
      if (new Set(used).size !== used.length) continue;
      const deck = Array.from({ length: 52 }, (_, c) => c).filter((c) => !used.includes(c));
      const runs: Card[][] = [];
      const need = 5 - board.length;
      if (need === 0) runs.push([]);
      if (need === 1) deck.forEach((c) => runs.push([c]));
      if (need === 2) deck.forEach((c, k) => deck.slice(k + 1).forEach((d) => runs.push([c, d])));
      const w = a[i]! * b[j]!;
      for (const r of runs) {
        const sa = evaluate([...cardsFromComboIndex(i), ...board, ...r]);
        const sb = evaluate([...cardsFromComboIndex(j), ...board, ...r]);
        if (sa > sb) win += w / runs.length;
        else if (sa === sb) tie += w / runs.length;
      }
      mass += w;
    }
  }
  return { equity: (win + tie / 2) / mass, win: win / mass, tie: tie / mass };
}

describe('range against range, exact after the flop', () => {
  test.each([
    ['AK, QQ', 'JJ+, AQs', 'Kh 7c 2d'],
    ['T9s, 88, AJo:0.5', 'KK, A9s, 76s', 'Th 9c 8d 2s'],
    ['AK, 55', 'QQ+, 54s', 'Ah 5d 4c Kc 2h'],
  ])('%s vs %s on %s matches brute force, win and tie included', (aText, bText, boardText) => {
    const board = cards(boardText);
    const r = rangeVsRange(parseRange(aText), parseRange(bText), board);
    const bf = bruteForce(aText, bText, board);
    expect(r.method).toBe('exact');
    expect(r.players[0]!.equity).toBeCloseTo(bf.equity, 9);
    expect(r.players[0]!.win).toBeCloseTo(bf.win, 9);
    expect(r.players[0]!.tie).toBeCloseTo(bf.tie, 9);
    expect(r.players[0]!.equity + r.players[1]!.equity).toBeCloseTo(1, 9);
  }, 60_000);

  test('a single hand against a range agrees with the hand-vs-range engine, combo by combo', () => {
    const board = cards('Qh Jh 2c');
    const villain = parseRange('QQ, JJ, AQs, 22, T9s:0.5, KTo');
    const hero = parseRange('AhKh');
    const r = rangeVsRange(hero, villain, board);
    const single = equityVsRange(cards('Ah Kh'), board, villain);
    expect(r.players[0]!.equity).toBeCloseTo(single.equity, 6);
    const kt = comboIndex(cards('Ks')[0]!, cards('Td')[0]!);
    expect(r.players[1]!.vsField[kt]).toBeCloseTo(1 - single.vsCombo[kt]!, 6);
  });

  test('full ranges on the flop are quick enough for the screen', () => {
    const t0 = performance.now();
    rangeVsRange(parseRange('22+, A2+, K2+, Q2+, J2+, T2+, 92+, 82+, 72+, 62+, 52+, 42+, 32'), parseRange('22+, A2s+, KTs+, ATo+'), cards('Jc 9d 5c'));
    expect(performance.now() - t0).toBeLessThan(15_000); // ~1 s in a browser; the test runner is slower
  }, 30_000);
});

describe('preflop, from the table', () => {
  let table: PreflopTable;
  beforeAll(() => {
    const file = readFileSync(new URL('./preflop-hu.bin', import.meta.url));
    table = PreflopTable.fromBuffer(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
  });
  const any = '22+, A2+, K2+, Q2+, J2+, T2+, 92+, 82+, 72+, 62+, 52+, 42+, 32';

  test('AA against any two cards is 85.2 %', () => {
    const r = rangeVsRange(parseRange('AA'), parseRange(any), [], table);
    expect(r.method).toBe('table');
    expect(r.players[0]!.equity).toBeCloseTo(0.852, 2);
    expect(Number.isNaN(r.players[0]!.win)).toBe(true);
  });

  test('a range against itself is exactly 50 %', () => {
    const r = rangeVsRange(parseRange('TT+, AQ+'), parseRange('TT+, AQ+'), [], table);
    expect(r.players[0]!.equity).toBeCloseTo(0.5, 9);
  });

  test('both sides add up to 1 and agree with Monte Carlo', () => {
    const a = parseRange('22+, A2s+, KTs+, ATo+');
    const b = parseRange('JJ+, AK');
    const exact = rangeVsRange(a, b, [], table);
    expect(exact.players[0]!.equity + exact.players[1]!.equity).toBeCloseTo(1, 9);
    const mc = monteCarloField([a, b], [], { samples: 80_000, seed: 5 });
    expect(Math.abs(mc.players[0]!.equity - exact.players[0]!.equity)).toBeLessThan(4 * mc.players[0]!.stdError!);
  });
});

describe('Monte Carlo for several players', () => {
  test('two players on the flop agree with the exact answer', () => {
    const a = parseRange('AK, QQ, 76s');
    const b = parseRange('JJ+, AQs, KQs');
    const board = cards('Kh 7c 2d');
    const exact = rangeVsRange(a, b, board).players[0]!;
    const mc = monteCarloField([a, b], board, { samples: 60_000, seed: 2 }).players[0]!;
    expect(Math.abs(mc.equity - exact.equity)).toBeLessThan(4 * mc.stdError!);
    expect(Math.abs(mc.win - exact.win)).toBeLessThan(0.02);
  });

  test('three-way: the shares add up to the whole pot, aces ahead of kings ahead of queens', () => {
    const r = monteCarloField([parseRange('AA'), parseRange('KK'), parseRange('QQ')], [], { samples: 60_000, seed: 9 });
    const [aa, kk, qq] = r.players.map((p) => p.equity) as [number, number, number];
    expect(aa + kk + qq).toBeCloseTo(1, 9);
    expect(aa).toBeGreaterThan(kk);
    expect(kk).toBeGreaterThan(qq);
  });

  test('each combo keeps its own result for the heat map', () => {
    const r = monteCarloField([parseRange('AA, 72o'), parseRange('KK')], cards('Ks 8d 3c'), { samples: 40_000, seed: 4 });
    const aces = r.players[0]!.vsField[comboIndex(cards('Ah')[0]!, cards('Ad')[0]!)]!;
    const rags = r.players[0]!.vsField[comboIndex(cards('7h')[0]!, cards('2d')[0]!)]!;
    expect(aces).toBeLessThan(0.15); // set of kings
    expect(rags).toBeLessThan(0.05);
  });
});
