import { describe, expect, test } from 'vitest';
import { parseCards } from '../cards';
import { equityVsRange } from '../equity/equity';
import { parseRange } from '../ranges/notation';
import { MOTIVE_PRESETS } from './profile';
import { exploreSizes, type SizeQuestion } from './sizes';

// The button opened, the big blind (a Fish) called and checks the flop: the button to act.
const hero = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
const bb = parseRange('22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o');
const cards = (t: string) => parseCards(t.split(' '));

const checkedTo = (board: string, heroCards?: string, inPosition = true): SizeQuestion => ({
  situation: { board: cards(board), pot: 550, toCall: 0, stack: 9750, oppStack: 9750, bb: 100, inPosition },
  actor: { profile: MOTIVE_PRESETS.Reg!, range: hero, cards: heroCards ? cards(heroCards) : undefined },
  others: [{ seat: 2, profile: MOTIVE_PRESETS.Fish!, range: bb }],
});

describe('size explorer', { timeout: 120_000 }, () => {
  const wet = exploreSizes(checkedTo('Js 9d 2s', 'Ah Jh'));

  test('every size gets an answer that adds up, from ⅓ pot to all-in', () => {
    expect(wet.rows.map((r) => r.label)).toEqual(['Bet ⅓ pot', 'Bet ½ pot', 'Bet ¾ pot', 'Bet pot', 'Bet 1.5x pot', 'All-in']);
    for (const r of wet.rows) {
      expect(r.fold + r.call + r.raise).toBeCloseTo(1, 5);
      expect(r.players).toHaveLength(1);
    }
    expect(wet.multiway).toBe(false);
    // in position a check ends the street: checked down, nobody answers
    expect(wet.passive.map((p) => p.label)).toEqual(['Check']);
    expect(wet.passive[0]!.players).toEqual([]);
    expect(wet.passive[0]!.ev).toBeCloseTo(wet.equity! * 550, 5);
  });

  // HHP-S7eq8103TDg-06: inelastic hands never fold to a big bet; the rest fold to any size.
  test('elastic and inelastic: strong hands continue at any size, air drops out as the size grows', () => {
    const first = wet.rows[0]!.players[0]!;
    const big = wet.rows[4]!.players[0]!;
    expect(first.byBucket.cpfs!.cont).toBeGreaterThan(0.95);
    expect(big.byBucket.cpfs!.cont).toBeGreaterThan(0.95);
    expect(big.byBucket.air!.cont).toBeLessThan(first.byBucket.air!.cont);
    expect(wet.rows[4]!.fold).toBeGreaterThan(wet.rows[0]!.fold);
  });

  test('EV with known cards: top pair top kicker bets for value against the Fish', () => {
    for (const r of wet.rows) {
      expect(Number.isFinite(r.ev!)).toBe(true);
      expect(r.eqCall).toBeGreaterThan(0);
    }
    const best = Math.max(...wet.rows.map((r) => r.ev!));
    expect(best).toBeGreaterThan(wet.passive[0]!.ev!);
  });

  // HHP-S7eq8103TDg-52: let overpairs call the flop once, then they fold to a big turn overbet;
  // HHP-vsSFecrDrb0-32: big late bets are underbluffed - and recreational players know it.
  test('the Fish calls top pair to normal sizes, folds it to overbets - more on later streets; sets never fold', () => {
    const turn = exploreSizes(checkedTo('Js 9d 2s 3c', 'Ah Jh'));
    const river = exploreSizes(checkedTo('Js 9d 2s 3c 7h', 'Ah Jh'));
    const at = (a: typeof wet, label: string) => a.rows.find((r) => r.label === label)!.players[0]!.byBucket;
    for (const a of [turn, river]) {
      expect(at(a, 'Bet ½ pot').thin!.cont).toBeGreaterThan(0.9);
      expect(at(a, 'Bet 1.5x pot').thin!.cont).toBeLessThan(0.6);
    }
    expect(at(river, 'Bet 1.5x pot').thin!.cont).toBeLessThan(at(wet, 'Bet 1.5x pot').thin!.cont);
    expect(at(river, 'All-in').cpfs!.cont).toBeGreaterThan(0.9);
    // HHP-hb5V55q-tTU-41/42: a raise against a big bet is almost never a bluff - nor thin value
    const big = at(river, 'Bet 1.5x pot');
    expect(big.thin!.raise).toBeLessThan(0.05);
    expect(big.thick!.raise).toBeLessThan(0.05);
    expect(big.cpfs!.raise).toBeGreaterThan(0.8);
  });

  test('facing a bet: the raise sizes, with fold and call as the passive options', () => {
    const q: SizeQuestion = {
      situation: { board: cards('Js 9d 2s'), pot: 550, toCall: 183, stack: 9750, oppStack: 9567, bb: 100, inPosition: false },
      actor: { profile: MOTIVE_PRESETS.Fish!, range: bb, cards: cards('9s 9c') },
      others: [{ seat: 2, profile: MOTIVE_PRESETS.Reg!, range: hero }],
    };
    const a = exploreSizes(q);
    expect(a.rows.every((r) => r.kind === 'raise')).toBe(true);
    expect(a.rows.length).toBeGreaterThanOrEqual(3);
    expect(a.passive.map((p) => p.label)).toEqual(['Fold', 'Call']);
    expect(a.passive[0]!.ev).toBe(0);
    // a call that closes the action: checked down, nobody answers
    expect(a.passive[1]!.players).toEqual([]);
    expect(a.passive[1]!.ev).toBeCloseTo(a.equity! * (550 + 2 * 183) - 183, 5);
    for (const r of a.rows) expect(r.fold + r.call + r.raise).toBeCloseTo(1, 5);
  });

  // The check out of position is no free showdown: the other player bets behind it, and then the
  // actor folds or calls - the same one-street yardstick as a bet that gets called or raised.
  test('a check out of position: they check behind or bet, and the EV counts both', () => {
    const oop = exploreSizes(checkedTo('Js 9d 2s', 'Ah Jh', false));
    const check = oop.passive[0]!;
    expect(check.label).toBe('Check');
    expect(check.players).toHaveLength(1);
    expect(check.fold).toBe(0);
    expect(check.call + check.raise).toBeCloseTo(1, 5);
    expect(check.raise).toBeGreaterThan(0.05);
    // with a weak hand the bet behind the check costs: less than the free showdown
    const weak = exploreSizes(checkedTo('Js 9d 2s', '6h 5h', false));
    expect(weak.passive[0]!.ev!).toBeLessThan(weak.equity! * 550);
    expect(weak.passive[0]!.ev!).toBeGreaterThanOrEqual(0);
  });
});

describe('size explorer, multiway', { timeout: 180_000 }, () => {
  // The button opened, the small blind and the big blind (both Fish) called; checked to the button.
  const sb = parseRange('22-TT, A2s-AQs, K9s-KJs, QTs+, JTs, T9s, 98s, AJo-AQo, KQo');
  const threeWay = (heroCards: string, board = 'Js 9d 2s'): SizeQuestion => ({
    situation: { board: cards(board), pot: 825, toCall: 0, stack: 9725, oppStack: 9725, bb: 100, inPosition: true },
    actor: { profile: MOTIVE_PRESETS.Reg!, range: hero, cards: cards(heroCards) },
    others: [
      { seat: 1, profile: MOTIVE_PRESETS.Fish!, range: sb, inPosition: false, after: false },
      { seat: 2, profile: MOTIVE_PRESETS.Fish!, range: bb, inPosition: false, after: false },
    ],
  });
  const mw = exploreSizes(threeWay('Ah Jh'));

  test('each player answers every size; everyone folds = both fold, the shares add up', () => {
    expect(mw.multiway).toBe(true);
    for (const r of mw.rows) {
      expect(r.players.map((p) => p.seat)).toEqual([1, 2]);
      expect(r.fold).toBeCloseTo(r.players[0]!.fold * r.players[1]!.fold, 6);
      expect(r.fold + r.call + r.raise).toBeCloseTo(1, 5);
      expect(Number.isFinite(r.ev!)).toBe(true);
    }
    // in position the check ends the street: checked down against both
    expect(mw.passive[0]!.players).toEqual([]);
    expect(mw.passive[0]!.ev).toBeCloseTo(mw.equity! * 825, 5);
  });

  // HHP-rQP5RyjqanM-10: bluffing multiway works less - the bet needs everyone to fold.
  test('a bet gets fewer folds from two players than from one', () => {
    const hu = exploreSizes({ ...threeWay('Ah Jh'), others: [threeWay('Ah Jh').others[1]!] });
    mw.rows.forEach((r, i) => {
      if (hu.rows[i]!.label === r.label) expect(r.fold).toBeLessThan(hu.rows[i]!.fold);
    });
  });

  test('equity against both players is below equity against either one', () => {
    const vsBB = equityVsRange(cards('Ah Jh'), cards('Js 9d 2s'), bb).equity;
    const vsSB = equityVsRange(cards('Ah Jh'), cards('Js 9d 2s'), sb).equity;
    expect(mw.equity!).toBeLessThan(Math.min(vsBB, vsSB));
  });

  test('facing a bet with a player behind: a call gets that player\'s answer, a raise gets both', () => {
    // the small blind (seat 1) bet 275 into 825; the button calls or raises; the big blind still to act
    const q: SizeQuestion = {
      situation: { board: cards('Js 9d 2s'), pot: 825, toCall: 275, stack: 9725, oppStack: 9725, bb: 100, inPosition: true, behind: 1 },
      actor: { profile: MOTIVE_PRESETS.Reg!, range: hero, cards: cards('Ah Jh') },
      others: [
        { seat: 2, profile: MOTIVE_PRESETS.Fish!, range: bb, streetBet: 0, inPosition: false },
        { seat: 1, profile: MOTIVE_PRESETS.Fish!, range: sb, streetBet: 275, inPosition: false },
      ],
    };
    const a = exploreSizes(q);
    const call = a.passive.find((p) => p.kind === 'call')!;
    expect(call.players.map((p) => p.seat)).toEqual([2]);
    expect(Number.isFinite(call.ev!)).toBe(true);
    for (const r of a.rows) expect(r.players.map((p) => p.seat)).toEqual([2, 1]);
  });
});
