import { describe, expect, test } from 'vitest';
import { parseCards } from './cards';
import { evaluate } from './evaluator';
import { CARD_HI, CARD_LO, evalCards, evalPacked } from './fastEval';

/** Hand counts per category (high card .. straight flush), from combinatorics. */
const FIVE_CARD_COUNTS = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40];
const SEVEN_CARD_COUNTS = [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584];

describe('fast evaluator', () => {
  test('every 5-card hand scores exactly like the reference evaluator', () => {
    const counts = new Array<number>(9).fill(0);
    const distinct = new Set<number>();
    let mismatches = 0;
    const hand = [0, 0, 0, 0, 0];
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++)
          for (let d = c + 1; d < 52; d++)
            for (let e = d + 1; e < 52; e++) {
              hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
              const fast = evalPacked(
                CARD_LO[a]! | CARD_LO[b]! | CARD_LO[c]! | CARD_LO[d]! | CARD_LO[e]!,
                CARD_HI[a]! | CARD_HI[b]! | CARD_HI[c]! | CARD_HI[d]! | CARD_HI[e]!,
              );
              if (fast !== evaluate(hand)) mismatches++;
              counts[fast >> 20]!++;
              distinct.add(fast);
            }
    expect(mismatches).toBe(0);
    expect(counts).toEqual(FIVE_CARD_COUNTS);
    expect(distinct.size).toBe(7462); // the number of distinct 5-card poker hands
  }, 30_000); // 2.6 M hands through the readable evaluator: ~3 s, more on a busy machine

  test('random 6- and 7-card hands score like the reference', () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
    let mismatches = 0;
    for (let n = 0; n < 300_000; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      const size = n % 2 ? 6 : 7;
      for (let i = 0; i < size; i++) {
        const j = i + Math.floor(rand() * (52 - i));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
      const cards = deck.slice(0, size);
      if (evalCards(cards) !== evaluate(cards)) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  test.each([
    ['As Ks Qs Js Ts 2h 3d', 'royal flush'],
    ['5d 4d 3d 2d Ad Kd Qd', 'steel wheel beats the king-high flush'],
    ['Ah Ad Ac Ks Kh Kd 2c', 'two trips make a full house'],
    ['9s 9h 9d 9c Ks Kh Kd', 'quads with the trips as kicker'],
    ['Ah 2d 3c 4s 5h Kd Kc', 'wheel beats a pair'],
    ['Ah Ad Kc Ks Qh Qd Jc', 'three pairs: the third pair can be the kicker'],
  ])('%s (%s)', (text) => {
    const cards = parseCards(text.split(' '));
    expect(evalCards(cards)).toBe(evaluate(cards));
  });
});

// All 133,784,560 seven-card hands, about 10 s. Run with SLOW=1 npm test.
test.runIf(process.env.SLOW)('every 7-card hand: category counts and 4,824 distinct values', () => {
  const counts = new Array<number>(9).fill(0);
  const seen = new Set<number>();
  for (let a = 0; a < 52; a++) {
    const la = CARD_LO[a]!, ha = CARD_HI[a]!;
    for (let b = a + 1; b < 52; b++) {
      const lb = la | CARD_LO[b]!, hb = ha | CARD_HI[b]!;
      for (let c = b + 1; c < 52; c++) {
        const lc = lb | CARD_LO[c]!, hc = hb | CARD_HI[c]!;
        for (let d = c + 1; d < 52; d++) {
          const ld = lc | CARD_LO[d]!, hd = hc | CARD_HI[d]!;
          for (let e = d + 1; e < 52; e++) {
            const le = ld | CARD_LO[e]!, he = hd | CARD_HI[e]!;
            for (let f = e + 1; f < 52; f++) {
              const lf = le | CARD_LO[f]!, hf = he | CARD_HI[f]!;
              for (let g = f + 1; g < 52; g++) {
                const score = evalPacked(lf | CARD_LO[g]!, hf | CARD_HI[g]!);
                counts[score >> 20]!++;
                seen.add(score);
              }
            }
          }
        }
      }
    }
  }
  expect(counts).toEqual(SEVEN_CARD_COUNTS);
  expect(seen.size).toBe(4824);
}, 120_000);
