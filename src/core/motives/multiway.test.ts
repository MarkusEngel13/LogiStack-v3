/**
 * Multiway pots against Hungry Horse Poker's claims (Strategy Bible ids in the test names):
 * the hand has to beat everyone, a bet wins the pot only if everyone folds.
 */

import { describe, expect, test } from 'vitest';
import { bucketAll, type Bucket } from '../buckets';
import { parseCards } from '../cards';
import { parseRange } from '../ranges/notation';
import { decide, type Decision, type Situation } from './decide';
import { MOTIVE_PRESETS } from './profile';

const opener = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
const caller = parseRange('22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o');
const cards = (t: string) => parseCards(t.split(' '));
const fish = MOTIVE_PRESETS.Fish!;
const reg = MOTIVE_PRESETS.Reg!;
const WET = 'Js 9d 2s';
const STATIC = 'Ac 7d 2h';

const spot = (board: string, s: Partial<Situation> = {}): Situation => ({
  board: cards(board),
  pot: 825,
  toCall: 0,
  stack: 9725,
  oppStack: 9725,
  bb: 100,
  inPosition: false,
  ...s,
});

/** Weighted share of the combos (of a bucket, or all) that take an option of these kinds. */
function share(d: Decision, range: Float32Array, board: string, kinds: string[], bucket?: Bucket): number {
  const b = bucketAll(cards(board));
  let w = 0;
  let x = 0;
  for (let c = 0; c < 1326; c++) {
    if (!(range[c]! > 0) || Number.isNaN(d.probs[0]![c]!) || (bucket && b[c] !== bucket)) continue;
    w += range[c]!;
    d.options.forEach((o, i) => kinds.includes(o.kind) && (x += range[c]! * d.probs[i]![c]!));
  }
  return w > 0 ? x / w : NaN;
}

/** Share of a bucket within the part of the range that takes these kinds. */
function within(d: Decision, range: Float32Array, board: string, kinds: string[], bucket: Bucket): number {
  const b = bucketAll(cards(board));
  let all = 0;
  let inB = 0;
  for (let c = 0; c < 1326; c++) {
    if (!(range[c]! > 0) || Number.isNaN(d.probs[0]![c]!)) continue;
    let p = 0;
    d.options.forEach((o, i) => kinds.includes(o.kind) && (p += d.probs[i]![c]!));
    all += range[c]! * p;
    if (b[c] === bucket) inB += range[c]! * p;
  }
  return all > 0 ? inB / all : NaN;
}

describe('multiway', { timeout: 120_000 }, () => {
  test('one opponent in a list is the same as heads-up', () => {
    const a = decide(fish, spot(WET), caller, opener);
    const b = decide(fish, spot(WET), caller, [opener]);
    a.shares.forEach((x, i) => expect(b.shares[i]!).toBeCloseTo(x, 6));
  });

  // HHP-rQP5RyjqanM-10: players stab less the more multiway the pot is.
  test('checked to in position, air bets less into two players than into one', () => {
    const s = spot(STATIC, { inPosition: true });
    const hu = decide(reg, s, opener, caller);
    const mw = decide(reg, s, opener, [caller, caller]);
    expect(share(mw, opener, STATIC, ['bet'], 'air')).toBeLessThan(share(hu, opener, STATIC, ['bet'], 'air') * 0.8);
  });

  // HHP-rQP5RyjqanM-23: the value-betting threshold goes up the more players are in.
  test('thin value bets less into two players than into one', () => {
    const s = spot(STATIC, { inPosition: true });
    const hu = decide(reg, s, opener, caller);
    const mw = decide(reg, s, opener, [caller, caller]);
    expect(share(mw, opener, STATIC, ['bet'], 'thin')).toBeLessThan(share(hu, opener, STATIC, ['bet'], 'thin'));
  });

  // HHP-rQP5RyjqanM-57, HHP-ko62oOOAf_Q-08: a multiway donk is strong, unlike a heads-up one.
  test('a lead into the raiser and another player is stronger than a heads-up lead', () => {
    const s = spot(WET, { oppInitiative: true });
    const hu = decide(fish, s, caller, opener);
    const mw = decide(fish, s, caller, [opener, caller]);
    const strong = (d: Decision) => within(d, caller, WET, ['bet'], 'cpfs') + within(d, caller, WET, ['bet'], 'thick');
    expect(strong(mw)).toBeGreaterThan(strong(hu));
    expect(within(mw, caller, WET, ['bet'], 'air')).toBeLessThan(within(hu, caller, WET, ['bet'], 'air'));
    // heads-up the strong hands check to the raiser (to check-raise): the lead is draws and stabs
    expect(strong(hu)).toBeLessThan(0.35);
    expect(strong(mw)).toBeGreaterThan(0.6);
  });

  // HHP-vsSFecrDrb0-27, HHP-rQP5RyjqanM-31: a call next to act with players behind is not capped -
  // strong hands flat to keep the players behind in.
  test('facing a bet with a player still to act behind, strong hands flat more', () => {
    const facing = spot(WET, { pot: 825, toCall: 275, oppStack: 9450 });
    const alone = decide(fish, facing, caller, [opener, caller]);
    const behind = decide(fish, { ...facing, behind: 1 }, caller, [opener, caller]);
    expect(share(behind, caller, WET, ['call'], 'cpfs')).toBeGreaterThan(share(alone, caller, WET, ['call'], 'cpfs') + 0.1);
  });
});
