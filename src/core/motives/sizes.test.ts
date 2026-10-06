import { describe, expect, test } from 'vitest';
import { parseCards } from '../cards';
import { parseRange } from '../ranges/notation';
import { MOTIVE_PRESETS } from './profile';
import { exploreSizes, type SizeQuestion } from './sizes';

// The button opened, the big blind (a Fish) called and checks the flop: the button to act.
const hero = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
const bb = parseRange('22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o');
const cards = (t: string) => parseCards(t.split(' '));

const checkedTo = (board: string, heroCards?: string): SizeQuestion => ({
  situation: { board: cards(board), pot: 550, toCall: 0, stack: 9750, oppStack: 9750, bb: 100, inPosition: true },
  actor: { profile: MOTIVE_PRESETS.Reg!, range: hero, cards: heroCards ? cards(heroCards) : undefined },
  other: { profile: MOTIVE_PRESETS.Fish!, range: bb },
});

describe('size explorer', { timeout: 120_000 }, () => {
  const wet = exploreSizes(checkedTo('Js 9d 2s', 'Ah Jh'));

  test('every size gets an answer that adds up, from ⅓ pot to all-in', () => {
    expect(wet.rows.map((r) => r.label)).toEqual(['Bet ⅓ pot', 'Bet ½ pot', 'Bet ¾ pot', 'Bet pot', 'Bet 1.5x pot', 'All-in']);
    for (const r of wet.rows) expect(r.fold + r.call + r.raise).toBeCloseTo(1, 5);
    expect(wet.passive).toEqual([{ label: 'Check', ev: expect.any(Number) }]);
    expect(wet.passive[0]!.ev).toBeCloseTo(wet.equity! * 550, 5);
  });

  // HHP-S7eq8103TDg-06: inelastic hands never fold to a big bet; the rest fold to any size.
  test('elastic and inelastic: strong hands continue at any size, air drops out as the size grows', () => {
    const first = wet.rows[0]!;
    const big = wet.rows[4]!;
    expect(first.byBucket.cpfs!.cont).toBeGreaterThan(0.95);
    expect(big.byBucket.cpfs!.cont).toBeGreaterThan(0.95);
    expect(big.byBucket.air!.cont).toBeLessThan(first.byBucket.air!.cont);
    expect(big.fold).toBeGreaterThan(first.fold);
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
    const at = (a: typeof wet, label: string) => a.rows.find((r) => r.label === label)!;
    for (const a of [turn, river]) {
      expect(at(a, 'Bet ½ pot').byBucket.thin!.cont).toBeGreaterThan(0.9);
      expect(at(a, 'Bet 1.5x pot').byBucket.thin!.cont).toBeLessThan(0.6);
    }
    expect(at(river, 'Bet 1.5x pot').byBucket.thin!.cont).toBeLessThan(at(wet, 'Bet 1.5x pot').byBucket.thin!.cont);
    expect(at(river, 'All-in').byBucket.cpfs!.cont).toBeGreaterThan(0.9);
    // HHP-hb5V55q-tTU-41/42: a raise against a big bet is almost never a bluff - nor thin value
    const big = at(river, 'Bet 1.5x pot').byBucket;
    expect(big.thin!.raise).toBeLessThan(0.05);
    expect(big.thick!.raise).toBeLessThan(0.05);
    expect(big.cpfs!.raise).toBeGreaterThan(0.8);
  });

  test('facing a bet: the raise sizes, with fold and call as the passive options', () => {
    const q: SizeQuestion = {
      situation: { board: cards('Js 9d 2s'), pot: 550, toCall: 183, stack: 9750, oppStack: 9567, bb: 100, inPosition: false },
      actor: { profile: MOTIVE_PRESETS.Fish!, range: bb, cards: cards('9s 9c') },
      other: { profile: MOTIVE_PRESETS.Reg!, range: hero },
    };
    const a = exploreSizes(q);
    expect(a.rows.every((r) => r.kind === 'raise')).toBe(true);
    expect(a.rows.length).toBeGreaterThanOrEqual(3);
    expect(a.passive.map((p) => p.label)).toEqual(['Fold', 'Call']);
    expect(a.passive[0]!.ev).toBe(0);
    for (const r of a.rows) expect(r.fold + r.call + r.raise).toBeCloseTo(1, 5);
  });
});
