import { describe, expect, test } from 'vitest';
import { bucketAll } from './buckets';
import { comboIndex, parseCard, parseCards, suitOf } from './cards';
import { fearNumbers, groupFear } from './fear';
import { parseRange } from './ranges/notation';

const cards = (text: string) => parseCards(text.split(' '));
const combo = (text: string) => {
  const [a, b] = cards(text);
  return comboIndex(a!, b!);
};

// Hero (BTN open) against the BB's defence, as in the response-model tests
const hero = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
const bb = parseRange('22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o');

describe('a set on a wet board fears far more than on a static one', () => {
  const wet = fearNumbers(hero, bb, cards('Js 9d 2s'));
  const dry = fearNumbers(hero, bb, cards('Ac 7d 2h'));
  const wetSet = wet.fear[combo('Jh Jd')]!;
  const drySet = dry.fear[combo('7h 7c')]!;

  test('both sets are far ahead now', () => {
    expect(wet.ahead[combo('Jh Jd')]).toBeGreaterThan(0.95);
    expect(dry.ahead[combo('7h 7c')]).toBeGreaterThan(0.95);
  });

  test('more than twice the fear on J♠ 9♦ 2♠', () => {
    expect(wetSet).toBeGreaterThan(2 * drySet);
  });

  test('on J♠ 9♦ 2♠ the spades are the scary cards for the set', () => {
    const lost = (c: number) => wet.outdrawn[combo('Jh Jd') * 52 + c]!;
    const spades = wet.nextCards.filter((c) => suitOf(c) === 0 && !Number.isNaN(lost(c)));
    const others = wet.nextCards.filter((c) => suitOf(c) !== 0 && !Number.isNaN(lost(c)));
    const mean = (list: number[]) => list.reduce((s, c) => s + lost(c), 0) / list.length;
    expect(spades.length).toBe(11);
    expect(mean(spades)).toBeGreaterThan(3 * mean(others));
  });

  test('bucket level: the strong hands of the range fear more on the wet board', () => {
    const cpfs = (board: string) => {
      const buckets = bucketAll(cards(board));
      return (c: number) => buckets[c] === 'cpfs';
    };
    const wetGroup = groupFear(wet, hero, cpfs('Js 9d 2s'));
    const dryGroup = groupFear(dry, hero, cpfs('Ac 7d 2h'));
    expect(wetGroup.fear).toBeGreaterThan(2 * dryGroup.fear);
  });
});

describe('edges', () => {
  test('a hand nothing can beat has nothing to fear', () => {
    // royal flush on the turn
    const r = fearNumbers(parseRange('JsTs'), bb, cards('As Ks Qs 2d'));
    expect(r.ahead[combo('Js Ts')]).toBe(1);
    expect(r.fear[combo('Js Ts')]).toBe(0);
  });

  test('values stay in 0..1; combos outside the range are NaN', () => {
    const r = fearNumbers(hero, bb, cards('Js 9d 2s'));
    let seen = 0;
    for (let c = 0; c < 1326; c++) {
      const a = r.ahead[c]!;
      const f = r.fear[c]!;
      if (hero[c]! > 0 && !Number.isNaN(a)) {
        seen++;
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      } else if (!(hero[c]! > 0)) {
        expect(Number.isNaN(a)).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(200);
  });

  test('the next card cannot be one of the hand\'s own cards', () => {
    const r = fearNumbers(hero, bb, cards('Js 9d 2s'));
    expect(Number.isNaN(r.outdrawn[combo('Jh Jd') * 52 + parseCard('Jh')]!)).toBe(true);
  });

  test('needs a flop or a turn', () => {
    expect(() => fearNumbers(hero, bb, [])).toThrow();
    expect(() => fearNumbers(hero, bb, cards('Js 9d 2s 3c Th'))).toThrow();
  });
});
