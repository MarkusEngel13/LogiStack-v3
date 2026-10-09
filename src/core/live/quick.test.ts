import { describe, expect, it } from 'vitest';
import { cardToString, parseCard, suitOf } from '../cards';
import { applyEvent, initialState, replay } from '../engine/replay';
import type { TableState } from '../engine/state';
import type { HandEvent, HandRecord } from '../hand/types';
import { cellByName } from '../ranges/hands';
import {
  cellCards,
  flopCards,
  guessedSeats,
  handOver,
  handSummary,
  makeRoom,
  nextSuit,
  showdownUnknown,
  softCards,
  streetCard,
  streetKinds,
  usedCards,
  withHoleCards,
} from './quick';
import { actAs, restPass } from './tap';

const names = ['UTG', 'HJ', 'Hero', 'BTN', 'Fish', 'BB'];
// seat 0..5, button 3: SB = 4 (Fish), BB = 5, UTG = 0, HJ = 1, CO = 2 (Hero)
function hand(): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: 't',
    createdAt: '2026-10-09T00:00:00Z',
    table: { seats: 6, venue: 'home', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
    button: 3,
    hero: 2,
    players: names.map((name, seat) => ({ seat, name, stack: 2500, ...(seat === 2 ? { cards: ['As', 'Ks'] as [string, string] } : {}) })),
    events: [],
  };
}
const apply = (state: TableState, events: HandEvent[]) => events.reduce((st, e) => applyEvent(st, e, st.eventsApplied), state);
const strs = (cards: readonly number[]) => cards.map(cardToString);

describe('cards', () => {
  it('picks free suits for a grid cell', () => {
    const used = new Set([parseCard('As')]);
    const ak = cellCards(cellByName('AKs')!, used)!.map(cardToString);
    expect(ak).toEqual(['Ah', 'Kh']);
    expect(cellCards(cellByName('AA')!, new Set(['As', 'Ah', 'Ad'].map(parseCard)))).toBeNull();
    expect(cellCards(cellByName('72o')!, new Set())!.map(cardToString)).toEqual(['7s', '2h']);
  });

  it('a grid hand stays off the board’s suits where it can (no flush draw nobody saw)', () => {
    const board = ['2s', '7s', '9h'].map(parseCard);
    expect(strs(cellCards(cellByName('AKs')!, new Set(board), board)!)).toEqual(['Ad', 'Kd']);
    expect(strs(cellCards(cellByName('QQ')!, new Set(board), board)!)).toEqual(['Qd', 'Qc']);
  });

  it('builds flops from ranks and a texture', () => {
    const used = new Set(['As', 'Ks'].map(parseCard));
    const ranks = [11, 5, 0]; // K 7 2
    const rainbow = flopCards(ranks, 'rainbow', used)!;
    expect(new Set(rainbow.map(suitOf)).size).toBe(3);
    expect(rainbow.some((c) => used.has(c))).toBe(false);
    const two = flopCards(ranks, 'twotone', used, [0])!;
    expect(new Set(two.map(suitOf)).size).toBe(2);
    expect(suitOf(two[0]!)).toBe(suitOf(two[1]!));
    expect(suitOf(two[0]!)).not.toBe(0); // not your suit unless asked
    const draw = flopCards([10, 5, 0], 'twotone', used, [0], 0)!; // Q 7 2: K♠ is yours
    expect(suitOf(draw[0]!)).toBe(0);
    expect(new Set(flopCards(ranks, 'mono', used)!.map(suitOf)).size).toBe(1);
    // a paired flop can't be monotone: falls back to two-tone
    expect(new Set(flopCards([11, 11, 0], 'mono', used)!.map(suitOf)).size).toBe(2);
  });

  it('turn and river: no flush card, flush card, a (second) flush draw', () => {
    const board = ['Kh', '7h', '2d'].map(parseCard);
    const used = new Set([...board, ...['As', 'Ks'].map(parseCard)]);
    expect(suitOf(streetCard(3, 'flush', board, used)!)).toBe(1);
    expect([0, 3]).toContain(suitOf(streetCard(3, 'blank', board, used)!));
    expect(suitOf(streetCard(3, 'draw', board, used)!)).toBe(2); // the second draw: diamonds
    // on a rainbow flop the draw stays off your suit
    const rainbow = ['Kh', '7c', '2d'].map(parseCard);
    expect(suitOf(streetCard(3, 'draw', rainbow, new Set(rainbow), [1])!)).not.toBe(1);
    expect(cardToString(nextSuit(parseCard('Kh'), used))).toBe('Kd');
  });

  it('offers only the kinds that mean something on the board', () => {
    const kinds = (b: string[]) => streetKinds(b.map(parseCard)).map((k) => k.label);
    expect(kinds(['Kh', '7c', '2d'])).toEqual(['No flush card', 'Flush draw']);
    expect(kinds(['Kh', '7h', '2d'])).toEqual(['No flush card', 'Flush card', 'Second flush draw']);
    expect(kinds(['Kh', '7h', '2h'])).toEqual(['No flush card', 'Flush card']);
    expect(kinds(['Kh', '7c', '2d', '3s'])).toEqual(['No flush card']);
    expect(kinds(['Kh', '7h', '2d', '3d'])).toEqual(['No flush card', 'Flush card']);
  });
});

describe('guessed suits', () => {
  const grid = (): HandRecord => {
    const h = { ...hand(), players: hand().players.map(({ cards: _c, ...p }) => (void _c, p)) };
    return withHoleCards(h, 2, ['As', 'Ks'], true);
  };

  it('remembers which seats were picked on the grid', () => {
    const h = grid();
    expect(guessedSeats(h)).toEqual([2]);
    expect(h.players.find((p) => p.seat === 2)!.cards).toEqual(['As', 'Ks']);
    expect(guessedSeats(withHoleCards(h, 2, ['Ah', 'Kd'], false))).toEqual([]);
    expect(softCards(h)).toEqual(new Set(['As', 'Ks'].map(parseCard)));
    expect(softCards(h, 2).size).toBe(0);
  });

  it('a board card a guessed hand holds moves that hand, same class, off the board’s suits', () => {
    const h = grid();
    const room = makeRoom(h, ['Ks', '7h', '2c'].map(parseCard))!;
    expect(room.players.find((p) => p.seat === 2)!.cards).toEqual(['Ad', 'Kd']);
    // nothing to move: the same record
    expect(makeRoom(h, ['Qd', '7h', '2c'].map(parseCard))).toBe(h);
    // real cards don't move
    const exact = withHoleCards(h, 2, ['As', 'Ks'], false);
    expect(makeRoom(exact, ['Ks', '7h', '2c'].map(parseCard))).toBeNull();
    // the moved hand replays with the board
    let st = initialState(room);
    st = apply(st, actAs(st, 2, 'call')!);
    st = apply(st, restPass(st));
    expect(st.phase).toBe('dealing');
    expect(() => apply(st, [{ type: 'board', cards: ['Ks', '7h', '2c'] }])).not.toThrow();
  });

  it('real hole cards for one seat move a guessed hand of another', () => {
    const h = withHoleCards(grid(), 4, ['Qh', 'Qd'], true);
    const room = makeRoom(h, ['Qh', 'Js'].map(parseCard), 3)!;
    const fish = room.players.find((p) => p.seat === 4)!.cards!;
    expect(fish).not.toContain('Qh');
    expect(fish.every((c) => c[0] === 'Q')).toBe(true);
  });
});

describe('where the hand is', () => {
  it('showdown: who still has to show, then the result; the summary per street', () => {
    let st = initialState(hand());
    const tap = (seat: number, move: Parameters<typeof actAs>[2]) => (st = apply(st, actAs(st, seat, move)!));
    tap(2, { to: 75 });
    tap(4, 'call');
    tap(5, 'fold');
    st = apply(st, [{ type: 'board', cards: ['Kd', '7c', '2h'] }]);
    tap(2, { to: 90 });
    tap(4, 'call');
    st = apply(st, [{ type: 'board', cards: ['3d'] }]);
    tap(4, 'check');
    tap(2, 'check');
    st = apply(st, [{ type: 'board', cards: ['9s'] }]);
    tap(4, 'check');
    tap(2, 'check');
    expect(st.phase).toBe('showdown');
    expect(handOver(st)).toBe(false);
    expect(showdownUnknown(st).map((s) => s.seat)).toEqual([4]);
    const kq = cellCards(cellByName('KQo')!, usedCards(st))!.map(cardToString) as [string, string];
    st = apply(st, [{ type: 'show', seat: 4, cards: kq }]);
    expect(handOver(st)).toBe(true);
    expect(st.result!.net[2]).toBeGreaterThan(0);
    expect(handSummary(st)[0]).toBe('CO open 3 BB · SB call');
    expect(handSummary(st)[1]).toBe('K♦7♣2♥  SB x · CO bet ½ · SB call');
  });

  it('cards seen before the end are kept in the setup and decide the showdown by themselves', () => {
    const h = withHoleCards(hand(), 4, ['Qh', 'Qd'], true);
    let st = initialState(h);
    const tap = (seat: number, move: Parameters<typeof actAs>[2]) => (st = apply(st, actAs(st, seat, move)!));
    tap(2, { to: 75 });
    tap(4, 'call');
    tap(5, 'fold');
    for (const cards of [['Kd', '7c', '2h'], ['3d'], ['9s']]) {
      st = apply(st, [{ type: 'board', cards }]);
      tap(2, 'check');
    }
    expect(handOver(st)).toBe(true);
    expect(st.result!.pots[0]!.winners).toEqual([2]);
    expect(() => replay({ ...h, events: [] })).not.toThrow();
  });
});
