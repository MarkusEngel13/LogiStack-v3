import { describe, expect, test } from 'vitest';
import { FIXTURES } from '../fixtures';
import type { HandRecord } from '../hand/types';
import { buildPots } from './pots';
import { migrateHand } from '../hand/migrate';
import { HandError, currentPots, legalActions, potOdds, replay, replaySteps, straddleOptions } from './replay';

const positions = (rec: HandRecord) =>
  Object.fromEntries(replay(rec, 0).seats.map((s) => [s.seat, s.position]));

/** Final stacks must equal starting stacks minus rake: chips are never created or lost. */
function expectChipsConserved(rec: HandRecord) {
  const state = replay(rec);
  const start = rec.players.reduce((sum, p) => sum + p.stack, 0);
  const end = Object.values(state.result!.finalStacks).reduce((sum, v) => sum + v, 0);
  expect(end + state.result!.rake).toBe(start);
}

describe('01 steal: CO opens, everyone folds', () => {
  const rec = FIXTURES.steal;

  test('6-max positions from the button', () => {
    expect(positions(rec)).toEqual({ 0: 'LJ', 1: 'HJ', 2: 'CO', 3: 'BTN', 4: 'SB', 5: 'BB' });
  });

  test('blinds posted, UTG first to act, min raise to 2 BB', () => {
    const s = replay(rec, 0);
    expect(s.toAct).toBe(0);
    expect(s.seats.find((x) => x.seat === 4)!.streetBet).toBe(100);
    expect(s.seats.find((x) => x.seat === 5)!.streetBet).toBe(200);
    expect(legalActions(s)).toMatchObject({ seat: 0, toCall: 200, canCheck: false, canRaise: true, minTo: 400 });
  });

  test('uncalled raise comes back and the CO wins the blinds', () => {
    const s = replay(rec);
    expect(s.phase).toBe('complete');
    expect(s.log).toContainEqual({ kind: 'refund', event: 5, seat: 2, amount: 300 });
    expect(s.result!.pots).toEqual([{ amount: 500, eligible: [2], winners: [2], shares: { 2: 500 }, winningHand: undefined }]);
    expect(s.result!.net).toEqual({ 0: 0, 1: 0, 2: 300, 3: 0, 4: -100, 5: -200 });
    expect(s.result!.showdown).toBe(false);
  });

  test('chips conserved', () => expectChipsConserved(rec));
});

describe('02 multiway showdown with rake', () => {
  const rec = FIXTURES.multiwayShowdown;

  test('positions skip empty seats', () => {
    expect(positions(rec)).toEqual({ 0: 'BB', 2: 'LJ', 4: 'HJ', 5: 'CO', 7: 'BTN', 8: 'SB' });
  });

  test('flop starts with the first live player left of the button', () => {
    const afterFlop = replay(rec, 7); // events 0-6: preflop + flop cards
    expect(afterFlop.street).toBe('flop');
    expect(afterFlop.potInMiddle).toBe(1900);
    expect(afterFlop.toAct).toBe(0);
  });

  test('pot odds facing the turn bet', () => {
    const s = replay(rec, 15); // Dora bets 5000 into 8900
    const odds = potOdds(s)!;
    expect(odds).toMatchObject({ pot: 13900, toCall: 5000 });
    expect(odds.ratio).toBeCloseTo(2.78, 2);
    expect(odds.percent).toBeCloseTo(26.46, 2);
  });

  test('"allin" on the river becomes a bet of the whole stack', () => {
    const s = replay(rec, 19);
    expect(s.log.at(-1)).toMatchObject({ kind: 'action', seat: 0, action: 'bet', to: 11400, allIn: true });
  });

  test('flush beats the set; rake is capped', () => {
    const r = replay(rec).result!;
    expect(r.showdown).toBe(true);
    expect(r.rake).toBe(500);
    expect(r.pots).toHaveLength(1);
    expect(r.pots[0]).toMatchObject({ amount: 61700, eligible: [0, 4], winners: [0], winningHand: 'Flush, King high' });
    expect(r.pots[0]!.shares).toEqual({ 0: 61200 });
    expect(r.hands.map((h) => [h.seat, h.description])).toEqual([
      [0, 'Flush, King high'],
      [4, 'Three of a Kind, Nines'],
    ]);
    expect(r.net).toEqual({ 0: 31200, 2: -1600, 4: -30000, 5: 0, 7: 0, 8: -100 });
  });

  test('chips conserved', () => expectChipsConserved(rec));
});

describe('03 side pots', () => {
  const rec = FIXTURES.sidePots;

  test('10-max position names', () => {
    expect(positions(rec)).toEqual({
      0: 'SB', 1: 'BB', 2: 'UTG', 3: 'UTG+1', 4: 'UTG+2', 5: 'UTG+3', 6: 'LJ', 7: 'HJ', 8: 'CO', 9: 'BTN',
    });
  });

  test('after the all-ins nobody can bet, so the board runs out', () => {
    const s = replay(rec, 12);
    expect(s.phase).toBe('dealing');
    expect(s.needCards).toBe(3);
    expect(s.toAct).toBeNull();
    const afterFlop = replay(rec, 13);
    expect(afterFlop.phase).toBe('dealing');
    expect(afterFlop.needCards).toBe(1);
  });

  test('main pot and two side pots go to three different players', () => {
    const r = replay(rec).result!;
    expect(r.pots.map((p) => [p.amount, p.eligible, p.winners])).toEqual([
      [12000, [0, 1, 2, 3], [1]], // Ana's aces
      [9000, [0, 2, 3], [2]], // Bob's kings
      [8000, [0, 3], [0]], // Hero's queens with the king kicker beat Cem's
    ]);
    expect(r.net).toMatchObject({ 0: -2000, 1: 9000, 2: 3000, 3: -10000, 4: 0, 9: 0 });
  });

  test('chips conserved', () => expectChipsConserved(rec));
});

describe('04 straddle, short all-in, 7-2 game', () => {
  const rec = FIXTURES.straddle72;

  test('first to act is left of the straddle; min raise is twice the straddle', () => {
    const s = replay(rec, 1); // event 0 = Cal's straddle
    expect(s.currentBet).toBe(400);
    expect(legalActions(s)).toMatchObject({ seat: 3, toCall: 400, minTo: 800 });
  });

  test('the straddler gets an option', () => {
    const s = replay(rec, 5);
    expect(s.toAct).toBe(2);
    expect(legalActions(s)).toMatchObject({ canCheck: true, canRaise: true });
  });

  test('a short all-in raise does not re-open the betting for the original bettor', () => {
    const s = replay(rec, 10); // Cal bet 500, Dex all-in 600, Fritz called
    expect(s.toAct).toBe(2);
    expect(legalActions(s)).toMatchObject({ canCall: true, canRaise: false, toCall: 100 });
    const illegal: HandRecord = {
      ...rec,
      events: [...rec.events.slice(0, 10), { type: 'action', seat: 2, action: 'raise', to: 2000 }],
    };
    expect(() => replay(illegal)).toThrow(/only call or fold/);
  });

  test('uncalled turn bet comes back, then the river runs out', () => {
    const s = replay(rec, 15);
    expect(s.log).toContainEqual({ kind: 'refund', event: 14, seat: 5, amount: 2000 });
    expect(s.phase).toBe('dealing');
  });

  test('7-2 wins the pot and the bounty; the busted player pays nothing', () => {
    const r = replay(rec).result!;
    expect(r.pots[0]).toMatchObject({ amount: 3300, eligible: [3, 5], winners: [5], winningHand: 'Two Pair, Sevens and Twos' });
    expect(r.bounties).toEqual([
      { from: 0, to: 5, amount: 500, reason: 'seven-deuce' },
      { from: 1, to: 5, amount: 500, reason: 'seven-deuce' },
      { from: 2, to: 5, amount: 500, reason: 'seven-deuce' },
    ]);
    expect(r.net).toEqual({ 0: -600, 1: -700, 2: -1500, 3: -1000, 5: 3800 });
  });

  test('chips conserved', () => expectChipsConserved(rec));
});

describe('straddles as events', () => {
  const rec = FIXTURES.straddle72; // 5 players: SB 0, BB 1, UTG 2 (Cal), Dex 3, button 5 (Fritz)
  const withEvents = (base: HandRecord, events: HandRecord['events']): HandRecord => ({ ...base, events });

  test('before any action: UTG or the button may straddle', () => {
    expect(straddleOptions(replay(rec, 0))).toEqual([
      { seat: 2, kind: 'utg', suggested: 400 },
      { seat: 5, kind: 'button', suggested: 400 },
    ]);
  });

  test('after a straddle, the next player may re-straddle for double', () => {
    expect(straddleOptions(replay(rec, 1))).toEqual([{ seat: 3, kind: 'restraddle', suggested: 800 }]);
    const s = replay(withEvents(rec, [rec.events[0]!, { type: 'straddle', seat: 3, amount: 800 }]));
    expect(s.currentBet).toBe(800);
    expect(s.toAct).toBe(5); // left of the last straddler
    expect(s.log.at(-1)).toEqual({ kind: 'post', event: 1, seat: 3, post: 'straddle', amount: 800, allIn: false });
  });

  test('no straddles once someone has acted', () => {
    expect(straddleOptions(replay(rec, 2))).toEqual([]);
    expect(() => replay(withEvents(rec, [rec.events[0]!, rec.events[1]!, { type: 'straddle', seat: 5, amount: 800 }]))).toThrow(
      /before the first preflop action/,
    );
  });

  test('button straddle (Mississippi): the small blind acts first, the button last', () => {
    const s = replay(withEvents(FIXTURES.steal, [{ type: 'straddle', seat: 3, amount: 400 }])); // button = 3
    expect(s.toAct).toBe(4);
    const all = replay(
      withEvents(FIXTURES.steal, [
        { type: 'straddle', seat: 3, amount: 400 },
        ...[4, 5, 0, 1, 2].map((seat) => ({ type: 'action' as const, seat, action: 'call' as const })),
      ]),
    );
    expect(all.toAct).toBe(3);
    expect(legalActions(all)).toMatchObject({ canCheck: true });
  });

  test('wrong seat or too small', () => {
    expect(() => replay(withEvents(rec, [{ type: 'straddle', seat: 3, amount: 400 }]))).toThrow(/can't straddle now/);
    expect(() => replay(withEvents(rec, [{ type: 'straddle', seat: 2, amount: 200 }]))).toThrow(/more than 200/);
  });

  test('no straddles heads-up', () => {
    expect(straddleOptions(replay(FIXTURES.headsUpSplit, 0))).toEqual([]);
  });

  test('old saved hands with setup straddles are converted to events', () => {
    const { events, houseRules: _h, ...setup } = rec;
    const old = { ...setup, straddles: [{ seat: 2, amount: 400 }], events: events.slice(1) };
    const migrated = migrateHand(old);
    expect(migrated.events[0]).toEqual({ type: 'straddle', seat: 2, amount: 400 });
    expect('straddles' in migrated).toBe(false);
    expect(replay(migrated).result!.net).toEqual(replay(rec).result!.net);
  });
});

describe('05 squid game', () => {
  const rec = FIXTURES.squid;

  test('winning without a squid earns one; the last player without a squid pays everyone', () => {
    const r = replay(rec).result!;
    expect(r.squid!.awarded).toEqual([4]);
    expect(r.squid!.payout).toEqual([
      { from: 2, to: 0, amount: 1000, reason: 'squid' },
      { from: 2, to: 1, amount: 1000, reason: 'squid' },
      { from: 2, to: 3, amount: 1000, reason: 'squid' },
      { from: 2, to: 4, amount: 1000, reason: 'squid' },
    ]);
    expect(r.net).toEqual({ 0: 1000, 1: 1000, 2: -4000, 3: 400, 4: 1600 });
  });

  test('chips conserved', () => expectChipsConserved(rec));
});

describe('06 heads-up split pot with rake', () => {
  const rec = FIXTURES.headsUpSplit;

  test('heads-up: button posts the small blind and acts first preflop', () => {
    const s = replay(rec, 0);
    expect(positions(rec)).toEqual({ 1: 'BTN', 4: 'BB' });
    expect(s.seats.find((x) => x.seat === 1)!.streetBet).toBe(100);
    expect(s.toAct).toBe(1);
  });

  test('...and acts last after the flop', () => {
    expect(replay(rec, 3).toAct).toBe(4);
  });

  test('split pot: odd chip to the first seat left of the button', () => {
    const r = replay(rec).result!;
    expect(r.rake).toBe(91);
    expect(r.pots[0]).toMatchObject({ amount: 910, winners: [1, 4], winningHand: 'Straight, Ace high' });
    expect(r.pots[0]!.shares).toEqual({ 4: 410, 1: 409 });
  });

  test('no flop, no drop', () => {
    const r = replay({ ...rec, events: [{ type: 'action', seat: 1, action: 'fold' }] }).result!;
    expect(r.rake).toBe(0);
    expect(r.net).toEqual({ 1: -100, 4: 100 });
  });

  test('unknown cards at showdown leave the pot undecided', () => {
    const noCards: HandRecord = { ...rec, players: rec.players.map((p) => ({ ...p, cards: p.seat === 4 ? undefined : p.cards })) };
    const r = replay(noCards).result!;
    expect(r.resolved).toBe(false);
    expect(r.pots[0]!.winners).toBeNull();
    const withMuck: HandRecord = { ...noCards, events: [...noCards.events, { type: 'muck', seat: 4 }] };
    expect(replay(withMuck).result!.pots[0]!.winners).toEqual([1]);
  });

  test('chips conserved', () => expectChipsConserved(rec));
});

describe('validation', () => {
  const rec = FIXTURES.steal;
  const withEvents = (events: HandRecord['events']): HandRecord => ({ ...rec, events });

  test('acting out of turn', () => {
    expect(() => replay(withEvents([{ type: 'action', seat: 3, action: 'fold' }]))).toThrow(HandError);
    expect(() => replay(withEvents([{ type: 'action', seat: 3, action: 'fold' }]))).toThrow(/seat 0's turn/);
  });

  test('checking facing a bet', () => {
    expect(() => replay(withEvents([{ type: 'action', seat: 0, action: 'check' }]))).toThrow(/can't check/);
  });

  test('raise below the minimum', () => {
    expect(() => replay(withEvents([{ type: 'action', seat: 0, action: 'raise', to: 300 }]))).toThrow(/minimum raise is to 400/);
  });

  test('board cards before the betting round ends', () => {
    expect(() => replay(withEvents([{ type: 'board', cards: ['2c', '3c', '4c'] }]))).toThrow(/board cards can't come now/);
  });

  test('a card used twice', () => {
    const dup: HandRecord = { ...rec, players: rec.players.map((p) => (p.seat === 0 ? { ...p, cards: ['Ah', 'Kh'] } : p)) };
    expect(() => replay(dup)).toThrow(/Ah is already in play/);
  });

  test('error carries the event index', () => {
    try {
      replay(withEvents([{ type: 'action', seat: 0, action: 'fold' }, { type: 'action', seat: 0, action: 'fold' }]));
      expect.unreachable();
    } catch (e) {
      expect((e as HandError).eventIndex).toBe(1);
    }
  });
});

describe('replaySteps', () => {
  test('one state per step, each independent', () => {
    const rec = FIXTURES.multiwayShowdown;
    const steps = replaySteps(rec);
    expect(steps).toHaveLength(rec.events.length + 1);
    expect(steps[0]!.eventsApplied).toBe(0);
    expect(steps.at(-1)!.phase).toBe('showdown');
    expect(steps[1]!.seats).not.toBe(steps[2]!.seats);
    expect(steps[0]!.seats.find((s) => s.seat === 2)!.streetBet).toBe(0); // later steps didn't leak back
  });
});

describe('pots', () => {
  test('folded money fills levels but never makes its owner eligible', () => {
    expect(
      buildPots([
        { seat: 0, amount: 1000, live: true },
        { seat: 1, amount: 400, live: true },
        { seat: 2, amount: 700, live: false },
      ]),
    ).toEqual([
      { amount: 1200, eligible: [0, 1] },
      { amount: 900, eligible: [0] },
    ]);
  });

  test('BB ante is dead money in the main pot, not a side pot for the big blind', () => {
    // UTG raises to 500, everyone folds to the BB, who calls: the BB has 700 in, UTG 500.
    const rec: HandRecord = {
      ...FIXTURES.steal,
      table: { ...FIXTURES.steal.table, ante: { kind: 'bb', amount: 200 } },
      events: [
        { type: 'action', seat: 0, action: 'raise', to: 500 },
        { type: 'action', seat: 1, action: 'fold' },
        { type: 'action', seat: 2, action: 'fold' },
        { type: 'action', seat: 3, action: 'fold' },
        { type: 'action', seat: 4, action: 'fold' },
        { type: 'action', seat: 5, action: 'call' },
      ],
    };
    const s = replay(rec);
    expect(s.phase).toBe('dealing');
    expect(s.potInMiddle).toBe(1300);
    expect(currentPots(s)).toEqual([{ amount: 1300, eligible: [0, 5] }]);
  });
});
