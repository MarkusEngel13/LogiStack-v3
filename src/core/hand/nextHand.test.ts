import { describe, expect, test } from 'vitest';
import { initialState, replay } from '../engine/replay';
import { FIXTURES } from '../fixtures';
import { nextHand } from './nextHand';

describe('the next hand at the same table', () => {
  const prev = FIXTURES.multiwayShowdown; // 9 seats, 6 players; the button is on seat 7
  const final = replay(prev);
  const next = nextHand(prev, final, { id: 'next-1', createdAt: '2026-10-07T20:00:00Z', handNo: 2, rand: () => 0.3 });

  test('the button moves to the next player, stacks carry over, the actions start fresh', () => {
    expect(next.button).toBe(8);
    for (const p of next.players) expect(p.stack).toBe(final.result!.finalStacks[p.seat]);
    expect(next.events).toEqual([]);
    expect(next.ranges).toBeUndefined();
    expect(next.id).toBe('next-1');
    expect(next.handNo).toBe(2);
    expect(() => initialState(next)).not.toThrow();
  });

  test('Hero gets two random cards, nobody else has any', () => {
    const hero = next.players.find((p) => p.seat === prev.hero)!;
    expect(hero.cards).toHaveLength(2);
    expect(hero.cards![0]).not.toBe(hero.cards![1]);
    for (const p of next.players) if (p.seat !== prev.hero) expect(p.cards).toBeUndefined();
  });

  test('a player left without a big blind rebuys to their starting stack; the button wraps around', () => {
    const busted = { ...prev, button: 8, players: prev.players.map((p) => (p.seat === 0 ? { ...p, stack: 100 } : p)) };
    const fin = { ...final, result: { ...final.result!, finalStacks: { ...final.result!.finalStacks, 0: 50 } } };
    const n = nextHand(busted, fin, { id: 'n', createdAt: '' });
    expect(n.players.find((p) => p.seat === 0)!.stack).toBe(100);
    expect(n.button).toBe(0);
  });
});
