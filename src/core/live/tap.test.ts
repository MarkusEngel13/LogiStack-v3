import { describe, expect, it } from 'vitest';
import { applyEvent, initialState, replay } from '../engine/replay';
import type { TableState } from '../engine/state';
import type { HandEvent, HandRecord } from '../hand/types';
import { handOver } from './quick';
import { actAs, boxStart, boxStep, heroNet, heroOut, passUntil, restPass, sizePresets, stillToAct } from './tap';

const names = ['UTG', 'HJ', 'Hero', 'BTN', 'Fish', 'BB'];
// seat 0..5, button 3: SB = 4 (Fish), BB = 5, UTG = 0, HJ = 1, CO = 2 (Hero)
function hand(stacks: Record<number, number> = {}): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: 't',
    createdAt: '2026-10-10T00:00:00Z',
    table: { seats: 6, venue: 'home', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
    button: 3,
    hero: 2,
    players: names.map((name, seat) => ({ seat, name, stack: stacks[seat] ?? 2500, ...(seat === 2 ? { cards: ['As', 'Ks'] as [string, string] } : {}) })),
    events: [],
  };
}
const apply = (state: TableState, events: HandEvent[]) => events.reduce((st, e) => applyEvent(st, e, st.eventsApplied), state);
const play = (state: TableState, seat: number, move: Parameters<typeof actAs>[2]) => {
  const events = actAs(state, seat, move);
  expect(events).not.toBeNull();
  return { state: apply(state, events!), events: events! };
};

describe('tap the player who acts', () => {
  it('the players before him fold preflop; the next to act follows', () => {
    const st = initialState(hand());
    expect(stillToAct(st)).toEqual([0, 1, 2, 3, 4, 5]);
    const { state, events } = play(st, 2, { to: 75 });
    expect(events).toEqual([
      { type: 'action', seat: 0, action: 'fold' },
      { type: 'action', seat: 1, action: 'fold' },
      { type: 'action', seat: 2, action: 'raise', to: 75 },
    ]);
    expect(stillToAct(state)).toEqual([3, 4, 5]);
    expect(state.toAct).toBe(3);
  });

  it('after the flop the players before him check; facing a bet they fold', () => {
    let st = initialState(hand());
    st = play(st, 2, { to: 75 }).state;
    st = play(st, 5, 'call').state; // BTN and Fish fold, BB calls
    expect(st.phase).toBe('dealing');
    expect(st.potInMiddle).toBe(160);
    st = apply(st, [{ type: 'board', cards: ['Kd', '7c', '2h'] }]);
    expect(stillToAct(st)).toEqual([5, 2]);
    const bet = play(st, 2, { to: 80 });
    expect(bet.events[0]).toEqual({ type: 'action', seat: 5, action: 'check' });
    expect(stillToAct(bet.state)).toEqual([5]);
    const end = play(bet.state, 5, 'fold').state;
    expect(handOver(end)).toBe(true);
    expect(end.result!.net[2]).toBe(85);
    expect(heroNet(end, 2)).toBe(85);
  });

  it('skipping past you folds you too, and then your result is known', () => {
    const st = initialState(hand());
    const { state } = play(st, 3, { to: 75 });
    expect(heroOut(state, 2)).toBe(true);
    expect(heroNet(state, 2)).toBe(0);
    expect(heroOut(state, 5)).toBe(false);
    expect(heroNet(state, 5)).toBeNull();
    // the big blind folds to the raise: he loses his blind
    const bbFolds = play(state, 5, 'fold').state;
    expect(heroNet(bbFolds, 5)).toBe(-25);
  });

  it('a player who is not to act on this street cannot be tapped', () => {
    const st = initialState(hand());
    const { state } = play(st, 2, { to: 75 });
    expect(actAs(state, 0, 'call')).toBeNull(); // UTG folded
    expect(passUntil(state, 1)).toBeNull();
  });

  it('call means check when nothing is owed; the big blind checks his option', () => {
    let st = initialState(hand());
    st = play(st, 4, 'call').state; // everyone before the small blind folds, he completes
    const option = actAs(st, 5, 'call')!;
    expect(option).toEqual([{ type: 'action', seat: 5, action: 'check' }]);
    expect(apply(st, option).phase).toBe('dealing');
  });

  it('a size above the stack is all-in; below the smallest raise it becomes the smallest raise', () => {
    let st = initialState(hand({ 3: 300 }));
    st = play(st, 2, { to: 75 }).state;
    expect(actAs(st, 3, { to: 400 })!.at(-1)).toEqual({ type: 'action', seat: 3, action: 'allin' });
    expect(actAs(st, 3, { to: 80 })!.at(-1)).toEqual({ type: 'action', seat: 3, action: 'raise', to: 125 });
  });

  it('the rest pass: everyone folds to the open, or the street is checked through', () => {
    let st = initialState(hand());
    st = play(st, 2, { to: 75 }).state;
    const won = apply(st, restPass(st));
    expect(handOver(won)).toBe(true);
    expect(won.result!.net[2]).toBe(35);

    st = play(st, 5, 'call').state;
    st = apply(st, [{ type: 'board', cards: ['Kd', '7c', '2h'] }]);
    const checked = restPass(st);
    expect(checked.map((e) => e.type === 'action' && e.action)).toEqual(['check', 'check']);
    expect(apply(st, checked).phase).toBe('dealing');
  });
});

describe('sizes', () => {
  it('2-5 BB to open, 2-4x facing a raise, pot fractions after the flop', () => {
    let st = initialState(hand());
    expect(sizePresets(st).map((p) => [p.label, p.to])).toEqual([
      ['2 BB', 50],
      ['3 BB', 75],
      ['4 BB', 100],
      ['5 BB', 125],
    ]);
    st = play(st, 2, { to: 75 }).state;
    // 2.5x of 75 = 187.5, in 5-cent chips 190
    expect(sizePresets(st).map((p) => [p.label, p.to])).toEqual([
      ['2×', 150],
      ['2.5×', 190],
      ['3×', 225],
      ['4×', 300],
    ]);
    st = play(st, 5, 'call').state;
    st = apply(st, [{ type: 'board', cards: ['Kd', '7c', '2h'] }]);
    // pot 160
    expect(sizePresets(st).map((p) => [p.label, p.to])).toEqual([
      ['⅓', 55],
      ['½', 80],
      ['⅔', 105],
      ['pot', 160],
    ]);
  });

  it('a short stack sees each size once, the biggest as all-in', () => {
    let st = initialState(hand({ 3: 200 }));
    st = play(st, 2, { to: 75 }).state;
    const p = sizePresets(st);
    expect(p.map((x) => x.to)).toEqual([150, 190, 200]);
    expect(p.at(-1)!.allIn).toBe(true);
  });

  it('the amount box: your open, 3x facing a raise, half the pot; steps of a big blind', () => {
    let st = initialState(hand());
    expect(boxStart(st, 3)).toBe(75);
    expect(boxStep(st, 75, 1)).toBe(100);
    expect(boxStep(st, 50, -1)).toBe(50); // never below the smallest raise
    st = play(st, 2, { to: 75 }).state;
    expect(boxStart(st, 3)).toBe(225);
    st = play(st, 5, 'call').state;
    st = apply(st, [{ type: 'board', cards: ['Kd', '7c', '2h'] }]);
    expect(boxStart(st, 3)).toBe(80);
    expect(boxStep(st, 2475, 1)).toBe(2425); // all-in at most
  });
});

describe('the record', () => {
  it('a hand entered by taps replays from its setup and events', () => {
    const h = hand();
    let st = initialState(h);
    const events: HandEvent[] = [];
    const tap = (seat: number, move: Parameters<typeof actAs>[2]) => {
      const evs = actAs(st, seat, move)!;
      events.push(...evs);
      st = apply(st, evs);
    };
    const deal = (cards: string[]) => {
      events.push({ type: 'board', cards });
      st = apply(st, [{ type: 'board', cards }]);
    };
    tap(1, { to: 75 });
    tap(2, 'call');
    tap(5, 'call');
    deal(['Kd', '7c', '2h']);
    tap(1, { to: 120 });
    tap(2, 'call');
    tap(5, 'fold');
    deal(['3s']);
    events.push(...restPass(st));
    st = apply(st, restPass(st));
    deal(['9c']);
    tap(2, { to: 300 });
    tap(1, 'call');
    expect(st.phase).toBe('showdown');
    const record = { ...h, events };
    expect(() => replay(record)).not.toThrow();
    expect(replay(record).potInMiddle).toBe(st.potInMiddle);
  });
});
