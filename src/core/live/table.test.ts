import { describe, expect, it } from 'vitest';
import { initialState, replay } from '../engine/replay';
import type { HandRecord } from '../hand/types';
import { actAs } from './tap';
import { handAt, seatsFromHero, stacksForNext, tableFromList, tableOf, type LiveSeat, type LiveTable } from './table';

const seat = (name: string, stack = 2500): LiveSeat => ({ name, stack, playerType: name === 'Hero' ? '' : 'Unknown' });

/** A table saved before the tap flow: 9 seats with gaps, Hero on seat 3, the button on seat 7. */
const old: LiveTable = {
  name: 'Home game',
  seats: 9,
  currency: { code: 'EUR', minorPerMajor: 100 },
  blinds: { sb: 10, bb: 25 },
  startStack: 2500,
  openBB: 3,
  hero: 3,
  button: 7,
  players: [seat('Ann'), null, seat('Bob'), seat('Hero'), null, seat('Cid'), seat('Dan'), seat('Eve'), null],
};

const ids = { id: 'h1', createdAt: '2026-10-10T20:00:00Z', handNo: 1 };

describe('the table in seat order from Hero', () => {
  it('reads an old table clockwise from Hero, skipping empty seats', () => {
    expect(seatsFromHero(old)).toEqual([3, 5, 6, 7, 0, 2]);
  });

  it('a list from Hero becomes seats 0, 1, 2, ... with the button kept', () => {
    const list = seatsFromHero(old).map((s) => old.players[s]!);
    const t = tableFromList(old, list, seatsFromHero(old).indexOf(old.button));
    expect(t.seats).toBe(6);
    expect(t.hero).toBe(0);
    expect(t.players.map((p) => p!.name)).toEqual(['Hero', 'Cid', 'Dan', 'Eve', 'Ann', 'Bob']);
    expect(t.button).toBe(3);
    expect(t.players[t.button]!.name).toBe('Eve');
    // no button known: the player on your right
    expect(tableFromList(old, list).button).toBe(5);
  });

  it('a hand at the table replays; positions follow the button', () => {
    const t = tableFromList(old, seatsFromHero(old).map((s) => old.players[s]!), 3);
    const h = handAt(t, ids);
    const st = initialState(h);
    expect(st.seats.find((s) => s.seat === 3)!.position).toBe('BTN');
    expect(st.blindSeats).toEqual({ sb: 4, bb: 5 });
    expect(h.quick).toEqual({ guessedSuits: true });
    // and back to a table for changing it between hands
    const back = tableOf({ ...h, button: 1 }, t);
    expect(back.players.map((p) => p!.name)).toEqual(t.players.map((p) => p!.name));
    expect(back.button).toBe(1);
  });

  it('an old table still makes hands with its own numbering', () => {
    const h = handAt(old, ids);
    expect(h.hero).toBe(3);
    expect(h.players.map((p) => p.seat)).toEqual([0, 2, 3, 5, 6, 7]);
    expect(() => initialState(h)).not.toThrow();
  });
});

describe('stacks for the next hand', () => {
  const t = tableFromList(old, seatsFromHero(old).map((s) => old.players[s]!), 3);
  const h: HandRecord = handAt(t, ids); // the button on seat 3 (Eve): Hero is first to act

  it('a hand left unfinished: whoever folded keeps what he has left, the others start again', () => {
    const evs = actAs(initialState(h), 0, { to: 75 })!; // Hero opens
    const st = replay({ ...h, events: evs });
    const more = actAs(st, 5, 'call')!; // Cid, Dan, Eve and the small blind fold, the big blind calls
    const next = stacksForNext({ ...h, events: [...evs, ...more] });
    expect(next.phase).toBe('dealing');
    const stack = (seat: number) => next.seats.find((s) => s.seat === seat)!.stack;
    expect(stack(0)).toBe(2500); // still in: back to the start
    expect(stack(5)).toBe(2500);
    expect(stack(4)).toBe(2490); // folded his small blind
    expect(next.result).toBeNull();
  });

  it('a finished hand: the stacks at the end', () => {
    const st = initialState(h);
    const evs = actAs(st, 0, { to: 75 })!;
    const all = [...evs, ...actAs(replay({ ...h, events: evs }), 5, 'fold')!];
    const next = stacksForNext({ ...h, events: all });
    expect(next.result!.finalStacks[0]).toBe(2535);
    expect(next.result!.finalStacks[4]).toBe(2490);
  });
});
