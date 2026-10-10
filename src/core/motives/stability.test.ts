import { describe, expect, test } from 'vitest';
import { parseCards } from '../cards';
import { parseRange } from '../ranges/notation';
import { MOTIVE_PRESETS } from './profile';
import { exploreSizes, type SizeQuestion } from './sizes';
import { nudgeRange, nudges, stability, stabilityLine } from './stability';

const hero = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
const bb = parseRange('22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o');
const cards = (t: string) => parseCards(t.split(' '));
const sum = (w: Float32Array) => w.reduce((a, b) => a + b, 0);

const checkedTo = (board: string, heroCards: string): SizeQuestion => ({
  situation: { board: cards(board), pot: 550, toCall: 0, stack: 9750, oppStack: 9750, bb: 100, inPosition: true },
  actor: { profile: MOTIVE_PRESETS.Reg!, range: hero, cards: cards(heroCards) },
  others: [{ seat: 2, profile: MOTIVE_PRESETS.Fish!, range: bb }],
});

describe('solution stability', { timeout: 300_000 }, () => {
  test('preflop nudges add the next hands or drop the worst; postflop they tilt the weight', () => {
    const wider = nudgeRange(bb, 10, []);
    const narrower = nudgeRange(bb, -10, []);
    expect(sum(wider) - sum(bb)).toBeCloseTo(132.6, 0);
    expect(sum(bb) - sum(narrower)).toBeCloseTo(132.6, 0);
    // a calling range without QQ+ doesn't get QQ+ when it widens
    const aa = parseRange('AA');
    let aaIn = 0;
    for (let c = 0; c < 1326; c++) if (aa[c]! > 0) aaIn += wider[c]!;
    expect(aaIn).toBe(0);
    const board = cards('Js 9d 2s');
    const strong = nudgeRange(bb, 20, board);
    const weak = nudgeRange(bb, -20, board);
    const jj = parseRange('J9s');
    const air = parseRange('43s');
    const w = (x: Float32Array, r: Float32Array) => {
      let t = 0;
      for (let c = 0; c < 1326; c++) if (r[c]! > 0) t += x[c]!;
      return t;
    };
    expect(w(strong, jj)).toBeGreaterThan(w(weak, jj));
    expect(w(strong, air)).toBeLessThan(w(weak, air));
  });

  test('ten nudges heads-up, each a real change', () => {
    const q = checkedTo('Js 9d 2s', 'Ah Jh');
    const n = nudges(q);
    expect(n).toHaveLength(10);
    expect(new Set(n.map((x) => x.label)).size).toBe(10);
  });

  test('top pair top kicker betting into a Fish on a dry board is stable; the result reads as a line', () => {
    const q = checkedTo('Kd 7c 2h', 'Ah Kh');
    const t0 = performance.now();
    const s = stability(q, { base: exploreSizes(q) })!;
    const ms = performance.now() - t0;
    expect(s.best).toMatch(/Bet/);
    expect(s.of).toBe(10);
    expect(s.held).toBeGreaterThanOrEqual(8);
    expect(s.rangeLimit).toBeDefined();
    const line = stabilityLine(s);
    expect(line.text).toMatch(/best in/);
    console.log(`stability heads-up: ${Math.round(ms)} ms`, line.text, JSON.stringify(s.rangeLimit), s.flips);
  });
});
