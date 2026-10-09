import { expect, test } from 'vitest';
import { replay } from '../engine/replay';
import type { HandRecord } from '../hand/types';
import { countHand } from './stats';

// three-handed, button seat 0: BTN raises, SB folds, BB calls; flop: BB checks, BTN bets half pot,
// BB check-raises, BTN folds
const hand: HandRecord = {
  format: 'logistack.hand/0',
  id: 't',
  createdAt: '',
  table: { seats: 3, venue: 'home', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
  button: 0,
  players: [0, 1, 2].map((seat) => ({ seat, name: ['BTN', 'SB', 'BB'][seat]!, stack: 2500 })),
  events: [
    { type: 'action', seat: 0, action: 'raise', to: 75 },
    { type: 'action', seat: 1, action: 'fold' },
    { type: 'action', seat: 2, action: 'call' },
    { type: 'board', cards: ['Kd', '8c', '4h'] },
    { type: 'action', seat: 2, action: 'check' },
    { type: 'action', seat: 0, action: 'bet', to: 80 },
    { type: 'action', seat: 2, action: 'raise', to: 250 },
    { type: 'action', seat: 0, action: 'fold' },
  ],
};

test('counts a hand like a tracker', () => {
  const c = countHand(replay(hand), (seat) => ['BTN', 'SB', 'BB'][seat]!);
  const btn = c.get('BTN')!.stats;
  const sb = c.get('SB')!.stats;
  const bb = c.get('BB')!.stats;
  expect(btn.vpip).toEqual({ n: 1, of: 1 });
  expect(btn.pfr).toEqual({ n: 1, of: 1 });
  expect(btn.cbetFlop).toEqual({ n: 1, of: 1 });
  expect(sb.vpip).toEqual({ n: 0, of: 1 });
  expect(sb.threeBet).toEqual({ n: 0, of: 1 });
  expect(bb.vpip).toEqual({ n: 1, of: 1 });
  expect(bb.lead).toEqual({ n: 0, of: 1 }); // checked to the raiser
  expect(bb.foldToCbet).toEqual({ n: 0, of: 1 });
  expect(bb.raiseCbet).toEqual({ n: 1, of: 1 });
  expect(bb.checkRaise).toEqual({ n: 1, of: 1 });
  expect(bb.foldMedium).toEqual({ n: 0, of: 1 }); // 80 into 160 = half pot
  expect(btn.wtsd).toEqual({ n: 0, of: 1 });
  expect(c.get('BB')!.netBB).toBeCloseTo((75 + 10 + 80) / 25);
});
