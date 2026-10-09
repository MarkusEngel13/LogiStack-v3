import { describe, expect, test } from 'vitest';
import { parseCards } from '../../core/cards';
import { dealNext, nextBoardLabel } from './board';

const cards = (text: string) => parseCards(text.split(' '));

describe('the board button', () => {
  test('follows the street', () => {
    expect([0, 3, 4, 5].map(nextBoardLabel)).toEqual(['Random flop', 'Random turn', 'Random river', 'New flop']);
  });

  test('deals a flop, then a turn, then a river, then a fresh flop', () => {
    const held = cards('As Ks 7h 7d');
    for (let i = 0; i < 200; i++) {
      const flop = dealNext([], held);
      const turn = dealNext(flop, held);
      const river = dealNext(turn, held);
      const fresh = dealNext(river, held);
      expect([flop, turn, river, fresh].map((b) => b.length)).toEqual([3, 4, 5, 3]);
      expect(turn.slice(0, 3)).toEqual(flop);
      expect(river.slice(0, 4)).toEqual(turn);
      for (const b of [river, fresh]) {
        expect(new Set(b).size).toBe(b.length);
        expect(b.some((c) => held.includes(c))).toBe(false);
      }
    }
  });

  test('never deals a held card', () => {
    // 49 cards held: the flop can only be the three left, and then nothing is left for a turn
    const left = cards('2c 9d Th');
    const held = Array.from({ length: 52 }, (_, c) => c).filter((c) => !left.includes(c));
    expect(dealNext([], held).sort()).toEqual([...left].sort());
    expect(dealNext(left, held)).toEqual(left);
  });

  test('picks with the given random numbers', () => {
    // always the first card left in the deck: 2s 3s 4s, then 5s
    const first = () => 0;
    expect(dealNext([], [], first)).toEqual(cards('2s 3s 4s'));
    expect(dealNext(cards('2s 3s 4s'), [], first)).toEqual(cards('2s 3s 4s 5s'));
    expect(dealNext(cards('2s 3s 4s 5s'), cards('6s'), first)).toEqual(cards('2s 3s 4s 5s 7s'));
  });
});
