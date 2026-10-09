import { expect, test } from 'vitest';
import { replay } from '../engine/replay';
import { nextHand } from './nextHand';
import { sessions } from './sessions';
import type { HandRecord } from './types';

const first: HandRecord = {
  format: 'logistack.hand/0',
  id: 'h1',
  createdAt: '2026-10-09T18:00:00Z',
  handNo: 1,
  table: { seats: 2, venue: 'home', name: 'Thursday', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
  button: 0,
  hero: 0,
  players: [
    { seat: 0, name: 'Hero', stack: 2500, cards: ['As', 'Ad'] },
    { seat: 1, name: 'Dan', stack: 2500 },
  ],
  // heads-up: the button (Hero) is the small blind and raises, Dan folds: Hero wins 1 BB
  events: [
    { type: 'action', seat: 0, action: 'raise', to: 75 },
    { type: 'action', seat: 1, action: 'fold' },
  ],
};

test('hands dealt one after another form a session with Hero’s result', () => {
  const second = nextHand(first, replay(first), { id: 'h2', createdAt: '2026-10-09T18:01:00Z', handNo: 2, rand: () => 0.3 });
  expect(second.session).toBe('h1');
  // the second hand: Hero (now big blind) folds to a raise? he checks his option after a limp... just let Dan fold
  const played: HandRecord = { ...second, events: [{ type: 'action', seat: 1, action: 'fold' }] };
  const third = nextHand(played, replay(played), { id: 'h3', createdAt: '2026-10-09T18:02:00Z', handNo: 3 });
  expect(third.session).toBe('h1'); // stays the first hand's id
  const [s] = sessions([first, played, third]);
  expect(s!.hands).toHaveLength(2);
  expect(s!.unfinished).toBe(1);
  expect(s!.netBB).toBeCloseTo(1 + 0.4); // won Dan's big blind, then his small blind
  expect(s!.bbPer100).toBeCloseTo(70);
  expect(s!.best!.hand.id).toBe('h1');
  expect(s!.name).toBe('Thursday');
});

test('single hands are not sessions', () => {
  expect(sessions([first])).toEqual([]);
});
