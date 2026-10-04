import { describe, expect, test } from 'vitest';
import { parseCards, parseCard, cardToString, comboIndex, cardsFromComboIndex } from './cards';
import { evaluate, categoryOf, describeHand, HandCategory } from './evaluator';

const score = (text: string) => evaluate(parseCards(text.split(' ')));

describe('cards', () => {
  test('round-trips every card', () => {
    for (let c = 0; c < 52; c++) expect(parseCard(cardToString(c))).toBe(c);
  });

  test('combo index covers 0..1325 exactly once', () => {
    const seen = new Set<number>();
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++) {
        const i = comboIndex(a, b);
        expect(comboIndex(b, a)).toBe(i);
        expect(cardsFromComboIndex(i).sort((x, y) => x - y)).toEqual([a, b]);
        seen.add(i);
      }
    expect(seen.size).toBe(1326);
    expect(Math.max(...seen)).toBe(1325);
  });
});

describe('evaluate: categories', () => {
  const cases: [string, HandCategory, string][] = [
    ['As Ks Qs Js Ts 2d 3c', HandCategory.StraightFlush, 'Royal Flush'],
    ['5h 4h 3h 2h Ah Kd Kc', HandCategory.StraightFlush, 'Straight Flush, Five high'],
    ['9c 9d 9h 9s Ad 2c 3c', HandCategory.Quads, 'Four of a Kind, Nines'],
    ['Kc Kd Kh 7s 7d 2c 3c', HandCategory.FullHouse, 'Full House, Kings full of Sevens'],
    ['Kc Kd Kh 7s 7d 7c 3c', HandCategory.FullHouse, 'Full House, Kings full of Sevens'],
    ['Ad Jd 8d 4d 2d Kc Qh', HandCategory.Flush, 'Flush, Ace high'],
    ['Td 9c 8h 7s 6d 2c 2h', HandCategory.Straight, 'Straight, Ten high'],
    ['Ad 2c 3h 4s 5d Kc Kh', HandCategory.Straight, 'Straight, Five high'],
    ['Qd Qc Qh 7s 4d 2c 9h', HandCategory.Trips, 'Three of a Kind, Queens'],
    ['Kd Kc 7h 7s 4d 2c 9h', HandCategory.TwoPair, 'Two Pair, Kings and Sevens'],
    ['Jd Jc 7h 5s 4d 2c 9h', HandCategory.Pair, 'Pair of Jacks'],
    ['Ad Jc 7h 5s 4d 2c 9h', HandCategory.HighCard, 'High Card, Ace'],
  ];

  test.each(cases)('%s', (hand, category, name) => {
    const s = score(hand);
    expect(categoryOf(s)).toBe(category);
    expect(describeHand(s)).toBe(name);
  });
});

describe('evaluate: ordering', () => {
  test('categories rank in poker order', () => {
    const ladder = [
      'Ad Jc 7h 5s 4d 2c 9h', // high card
      'Jd Jc 7h 5s 4d 2c 9h', // pair
      'Kd Kc 7h 7s 4d 2c 9h', // two pair
      'Qd Qc Qh 7s 4d 2c 9h', // trips
      'Ad 2c 3h 4s 5d Kc Jh', // wheel
      'Ad Jd 8d 4d 2d Kc Qh', // flush
      'Kc Kd Kh 7s 7d 2c 3c', // full house
      '9c 9d 9h 9s Ad 2c 3c', // quads
      '5h 4h 3h 2h Ah Kd Kc', // steel wheel
    ].map(score);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeGreaterThan(ladder[i - 1]!);
  });

  test('kicker decides a pair', () => {
    expect(score('Ah Kd 9c 7s 4d 3h 2c')).toBeGreaterThan(score('Ah Qd 9c 7s 4d 3h 2c'));
    expect(score('Ah Ad Kc 7s 4d 3h 2c')).toBeGreaterThan(score('Ah Ad Qc 7s 4d 3h 2c'));
  });

  test('third pair can be the two-pair kicker', () => {
    // KK 77 with a 5 kicker vs KK 77 with the third pair (Q) as kicker
    expect(score('Kd Kc 7h 7s Qd Qc 2h')).toBeGreaterThan(score('Kd Kc 7h 7s 5d 4c 2h'));
    expect(describeHand(score('Kd Kc 7h 7s Qd Qc 2h'))).toBe('Two Pair, Kings and Queens');
  });

  test('wheel is the lowest straight', () => {
    expect(score('6d 2c 3h 4s 5d Kc Kh')).toBeGreaterThan(score('Ad 2c 3h 4s 5d Kc Kh'));
  });

  test('board plays: equal scores tie', () => {
    const board = 'As Ks Qd Jc Th';
    expect(score(`${board} 2c 3d`)).toBe(score(`${board} 4h 5h`));
  });

  test('flush compares all five cards', () => {
    expect(score('Ah Th 8h 6h 3h Kc 2d')).toBeGreaterThan(score('Ah Th 8h 6h 2h Kc Qd'));
  });

  test('works with 5 and 6 cards', () => {
    expect(categoryOf(score('Td 9c 8h 7s 6d'))).toBe(HandCategory.Straight);
    expect(categoryOf(score('Td Tc 8h 8s 6d 6c'))).toBe(HandCategory.TwoPair);
  });
});
