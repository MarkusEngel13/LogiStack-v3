import { describe, expect, test } from 'vitest';
import { parseCards, suitOf } from '../cards';
import { parseRange } from '../ranges/notation';
import { comboTotal } from '../ranges/range';
import { MOTIVE_PRESETS } from './profile';
import type { SizeQuestion } from './sizes';
import { whatIf } from './whatIf';

const hero = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
const bb = parseRange('22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o');
const cards = (t: string) => parseCards(t.split(' '));

/** The button with A♥J♥ on J♠9♦2♠, checked to by the big blind (a Fish). */
const q = (inPosition = true): SizeQuestion => ({
  situation: { board: cards('Js 9d 2s'), pot: 550, toCall: 0, stack: 9750, oppStack: 9750, bb: 100, inPosition },
  actor: { profile: MOTIVE_PRESETS.Reg!, range: hero, cards: cards('Ah Jh') },
  other: { profile: MOTIVE_PRESETS.Fish!, range: bb },
});

describe('what happens if', { timeout: 120_000 }, () => {
  const a = whatIf(q());

  test('the lines: check behind ends the street, each bet gets an answer and sends a calling range on', () => {
    expect(a.street).toBe('turn');
    expect(a.lines.map((l) => l.label)).toEqual(['Check behind', 'Bet ⅓ pot', 'Bet ¾ pot', 'Bet 1.5x pot']);
    expect(a.lines[0]!.answer).toBeNull();
    expect(a.lines[0]!.next).toBe(bb);
    expect(a.lines[0]!.pot).toBe(550);
    expect(a.lines[1]!.pot).toBe(550 + 2 * 183);
    for (const l of a.lines.slice(1)) expect(l.answer!.fold + l.answer!.passive + l.answer!.aggressive).toBeCloseTo(1, 5);
  });

  // HHP: a small bet keeps their weak hands in; a big one leaves the strong ones (elastic vs inelastic).
  test('the bigger the bet, the fewer and stronger the hands that reach the turn', () => {
    const [, small, big, over] = a.lines;
    expect(comboTotal(big!.next)).toBeLessThan(comboTotal(small!.next));
    expect(comboTotal(over!.next)).toBeLessThan(comboTotal(big!.next));
    expect(over!.equityNow!).toBeLessThan(small!.equityNow!);
  });

  test('every turn card: equity and buckets, nothing for cards that cannot come; a blank and a scare card', () => {
    const line = a.lines[1]!;
    for (const c of cards('Js 9d 2s Ah Jh')) expect(line.cards[c]).toBeNull();
    expect(line.cards.filter(Boolean)).toHaveLength(52 - 5);
    expect(a.blank).not.toBe(a.scare);
    const blank = line.cards[a.blank]!;
    const scare = line.cards[a.scare]!;
    expect(scare.equity!).toBeLessThan(blank.equity!);
    // on J♠9♦2♠ the scare card for a heart top pair is a spade (the flush) or a straight card (T, Q, 8)
    const spades = suitOf(cards('2s')[0]!);
    const straightRanks = cards('Tc Qc 8c').map((c) => c % 13);
    expect(suitOf(a.scare) === spades || straightRanks.includes(a.scare % 13)).toBe(true);
  });

  test('facing a bet: a call ends the street, a raise gets an answer', () => {
    const facing = whatIf({
      situation: { board: cards('Js 9d 2s'), pot: 550, toCall: 183, stack: 9750, oppStack: 9567, bb: 100, inPosition: false },
      actor: { profile: MOTIVE_PRESETS.Fish!, range: bb, cards: cards('9s 9c') },
      other: { profile: MOTIVE_PRESETS.Reg!, range: hero },
    });
    expect(facing.lines.map((l) => l.label)).toEqual(['Call', 'Raise 2.5x', 'Raise 3.5x']);
    expect(facing.lines[0]!.answer).toBeNull();
    expect(facing.lines[0]!.pot).toBe(550 + 2 * 183);
    expect(facing.lines[1]!.answer!.passiveLabel).toBe('call');
  });

  test('checking out of position: they bet or check behind, and the check-behind range goes on', () => {
    const oop = whatIf(q(false));
    const check = oop.lines[0]!;
    expect(check.label).toBe('Check');
    expect(check.answer!.passiveLabel).toBe('check behind');
    expect(check.answer!.fold).toBe(0);
    expect(comboTotal(check.next)).toBeLessThan(comboTotal(bb));
  });
});
