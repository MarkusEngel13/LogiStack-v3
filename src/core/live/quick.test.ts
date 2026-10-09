import { describe, expect, it } from 'vitest';
import { cardToString, parseCard, suitOf } from '../cards';
import { applyEvent, initialState, replay } from '../engine/replay';
import type { TableState } from '../engine/state';
import type { HandEvent, HandRecord } from '../hand/types';
import { cellByName } from '../ranges/hands';
import { cellCards, flopCards, handOver, handSummary, nextSuit, postflopLines, preflopLines, showdownUnknown, streetCard, usedCards } from './quick';

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
const n = { hero: 2, name: (s: number) => names[s]! };
const apply = (state: TableState, events: HandEvent[]) => events.reduce((st, e) => applyEvent(st, e, st.eventsApplied), state);

describe('cards', () => {
  it('picks free suits for a grid cell', () => {
    const used = new Set([parseCard('As')]);
    const ak = cellCards(cellByName('AKs')!, used)!.map(cardToString);
    expect(ak).toEqual(['Ah', 'Kh']);
    expect(cellCards(cellByName('AA')!, new Set(['As', 'Ah', 'Ad'].map(parseCard)))).toBeNull();
    expect(cellCards(cellByName('72o')!, new Set())!.map(cardToString)).toEqual(['7s', '2h']);
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

  it('turn and river: blank or flush card', () => {
    const board = ['Kh', '7h', '2d'].map(parseCard);
    const used = new Set([...board, ...['As', 'Ks'].map(parseCard)]);
    expect(suitOf(streetCard(3, 'flush', board, used)!)).toBe(1);
    expect([0, 3]).toContain(suitOf(streetCard(3, 'blank', board, used)!));
    expect(cardToString(nextSuit(parseCard('Kh'), used))).toBe('Kd');
  });
});

describe('lines', () => {
  it('preflop: you open, the fish calls; then flop lines to the river', () => {
    let st = initialState(hand());
    const pre = preflopLines(st, [2, 4], 3, n);
    const open = pre.find((l) => l.id === 'open-2')!;
    expect(open.label).toBe('You open 3 BB · Fish calls');
    st = apply(st, open.events);
    expect(st.phase).toBe('dealing');
    expect(st.seats.filter((s) => !s.folded && s.dealtIn).map((s) => s.seat)).toEqual([2, 4]);
    // 3-bet lines exist heads-up
    expect(pre.map((l) => l.id)).toContain('3b-2-4-fold');

    st = apply(st, [{ type: 'board', cards: flopCards([11, 5, 0], 'rainbow', usedCards(st))!.map(cardToString) }]);
    const flop = postflopLines(st, 0.5, n);
    const labels = flop.map((l) => l.label);
    expect(labels).toContain('Checked through');
    expect(labels).toContain('Fish bets ½ · you call');
    expect(labels).toContain('You bet ½ · Fish calls');
    expect(labels).toContain('You bet ½ · Fish raises · you fold');
    const cbet = flop.find((l) => l.label === 'You bet ½ · Fish calls')!;
    st = apply(st, cbet.events);
    // open 75, SB calls, BB folds: 175; the c-bet is half of it, 87.5 → 90 (5-cent chips)
    expect(st.potInMiddle).toBe(175 + 90 * 2);

    st = apply(st, [{ type: 'board', cards: [cardToString(streetCard(3, 'blank', st.board, usedCards(st))!)] }]);
    st = apply(st, postflopLines(st, 0.5, n).find((l) => l.id === 'check')!.events);
    st = apply(st, [{ type: 'board', cards: [cardToString(streetCard(8, 'blank', st.board, usedCards(st))!)] }]);
    st = apply(st, postflopLines(st, 0.66, n).find((l) => l.label === 'You bet ⅔ · Fish calls')!.events);
    expect(st.phase).toBe('showdown');
    expect(handOver(st)).toBe(false);
    expect(showdownUnknown(st).map((s) => s.seat)).toEqual([4]);
    const used = usedCards(st);
    const kq = cellCards(cellByName('KQo')!, used)!.map(cardToString) as [string, string];
    st = apply(st, [{ type: 'show', seat: 4, cards: kq }]);
    expect(handOver(st)).toBe(true);
    expect(st.result!.net[2]).toBeGreaterThan(0);
    expect(handSummary(st)[0]).toBe('CO open 3 BB · SB call');
  });

  it('a limped pot, and folding round to the open', () => {
    const st = initialState(hand());
    const limp = preflopLines(st, [2, 4, 5], 3, n).find((l) => l.id === 'limp')!;
    const end = apply(st, limp.events);
    expect(end.phase).toBe('dealing');
    expect(end.potInMiddle).toBe(75);
    const alone = preflopLines(st, [2], 3, n);
    expect(alone.map((l) => l.label)).toEqual(['You open 3 BB · all fold']);
    expect(apply(st, alone[0]!.events).phase).toBe('complete');
  });

  it('three-way flop: bet, one calls, one folds', () => {
    let st = initialState(hand());
    st = apply(st, preflopLines(st, [2, 4, 5], 3, n).find((l) => l.id === 'open-2')!.events);
    st = apply(st, [{ type: 'board', cards: ['Qd', '8c', '3h'] }]);
    const lines = postflopLines(st, 0.33, n);
    const l = lines.find((x) => x.label === 'You bet ⅓ · BB calls, Fish folds')!;
    expect(l).toBeDefined();
    const end = apply(st, l.events);
    expect(end.seats.filter((s) => s.dealtIn && !s.folded).map((s) => s.seat)).toEqual([2, 5]);
  });

  it('every line replays from the record', () => {
    const h = hand();
    const st = initialState(h);
    for (const l of preflopLines(st, [2, 5], 2.5, n)) expect(() => replay({ ...h, events: l.events })).not.toThrow();
  });
});
