/**
 * The motive model against Hungry Horse Poker's claims (Strategy Bible ids in the test names).
 * Each test is a direction the model must show, not a number it must hit: calibration comes later.
 *
 * Spot: Hero opens the button, the big blind defends; ranges as in the response-model tests.
 */

import { describe, expect, test } from 'vitest';
import { bucketAll, type Bucket } from '../buckets';
import { comboIndex, parseCards } from '../cards';
import { rangeEquity } from '../equity/field';
import { classifyAll } from '../handClass';
import { parseRange } from '../ranges/notation';
import { decide, oppBetsOn, rangeAfter, type Decision, type Situation } from './decide';
import { MOTIVE_PRESETS, NEUTRAL, withState, type MotiveProfile } from './profile';

const hero = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
const bb = parseRange('22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o');
const cards = (t: string) => parseCards(t.split(' '));
const fish = MOTIVE_PRESETS.Fish!;
const WET = 'Js 9d 2s';
const STATIC = 'Ac 7d 2h';

/** The big blind facing a c-bet of `share` pot (5.5 BB pot, ~97 BB deep). */
const facingCbet = (board: string, share = 1 / 3): Situation => ({
  board: cards(board),
  pot: 550,
  toCall: Math.round(550 * share),
  stack: 9700,
  oppStack: 9700 - Math.round(550 * share),
  bb: 100,
  inPosition: false,
});

/** Weighted share of a set of options among the combos `inGroup` picks. */
function shareOf(d: Decision, range: Float32Array, kinds: string[], inGroup: (combo: number) => boolean): number {
  let w = 0;
  let x = 0;
  for (let c = 0; c < 1326; c++) {
    if (!(range[c]! > 0) || !inGroup(c) || Number.isNaN(d.probs[0]![c]!)) continue;
    w += range[c]!;
    d.options.forEach((o, i) => {
      if (kinds.includes(o.kind)) x += range[c]! * d.probs[i]![c]!;
    });
  }
  return w > 0 ? x / w : NaN;
}

/** Average bet size (pots) among the combos of a group, weighted by how often each size is chosen. */
function avgBetSize(d: Decision, range: Float32Array, pot: number, inGroup: (combo: number) => boolean): number {
  let w = 0;
  let x = 0;
  for (let c = 0; c < 1326; c++) {
    if (!(range[c]! > 0) || !inGroup(c) || Number.isNaN(d.probs[0]![c]!)) continue;
    d.options.forEach((o, i) => {
      if (o.kind !== 'bet') return;
      const p = range[c]! * d.probs[i]![c]!;
      w += p;
      x += p * (o.amount / pot);
    });
  }
  return w > 0 ? x / w : NaN;
}

const bucketIs = (board: string, ...want: Bucket[]) => {
  const b = bucketAll(cards(board));
  return (c: number) => want.includes(b[c]!);
};
const madeIs = (board: string, made: string) => {
  const cls = classifyAll(cards(board));
  return (c: number) => cls[c]?.made === made;
};

describe('fear and greed on the flop (the big blind facing a ⅓-pot c-bet)', { timeout: 60_000 }, () => {
  const wet = decide(fish, facingCbet(WET), bb, hero);
  const dry = decide(fish, facingCbet(STATIC), bb, hero);

  test('every combo gets a probability distribution', () => {
    for (const d of [wet, dry]) {
      for (let c = 0; c < 1326; c++) {
        if (Number.isNaN(d.probs[0]![c]!)) continue;
        const sum = d.probs.reduce((s, pr) => s + pr[c]!, 0);
        expect(sum).toBeCloseTo(1, 5);
      }
    }
  });

  // HHP-sQTa32Rfsqs (27:28): "slow-plays when invulnerable, fast-plays when it fears a draw
  // shrinking its value"; HHP-VYx-LddJryw-04; HHP-iMpJnsP9NMs-46.
  test('sets fast-play on the wet board and slow-play on the static one', () => {
    const raiseWet = shareOf(wet, bb, ['raise'], madeIs(WET, 'set'));
    const raiseDry = shareOf(dry, bb, ['raise'], madeIs(STATIC, 'set'));
    expect(raiseWet).toBeGreaterThan(0.8);
    expect(raiseDry).toBeLessThan(0.3);
  });

  // The old doc: "they didn't raise the wet flop, so no sets or two pair" - capped.
  test('a call on the wet board caps the range; on the static board it does not', () => {
    const cpfsShare = (board: string, range: Float32Array) => {
      const isCpfs = bucketIs(board, 'cpfs');
      const live = bucketAll(cards(board));
      let a = 0;
      let t = 0;
      for (let c = 0; c < 1326; c++) {
        if (!(range[c]! > 0) || !live[c]) continue;
        t += range[c]!;
        if (isCpfs(c)) a += range[c]!;
      }
      return a / t;
    };
    const callWet = rangeAfter(wet, wet.options.findIndex((o) => o.kind === 'call'), bb);
    const callDry = rangeAfter(dry, dry.options.findIndex((o) => o.kind === 'call'), bb);
    expect(cpfsShare(WET, callWet) / cpfsShare(WET, bb)).toBeLessThan(0.25);
    expect(cpfsShare(STATIC, callDry) / cpfsShare(STATIC, bb)).toBeGreaterThan(0.5);
  });

  // The 80 % live player: "they bet/raise sets and two pair immediately but just call with flush draws".
  test('draws are passive: they call, they rarely raise', () => {
    const draws = bucketIs(WET, 'strong-draw');
    expect(shareOf(wet, bb, ['raise'], draws)).toBeLessThan(0.15);
    expect(shareOf(wet, bb, ['call'], draws)).toBeGreaterThan(0.75);
  });

  // HHP: live players under-bluff-raise (fear of embarrassment, of losing a stack).
  test('air rarely raises', () => {
    expect(shareOf(wet, bb, ['raise'], bucketIs(WET, 'air'))).toBeLessThan(0.1);
    expect(shareOf(dry, bb, ['raise'], bucketIs(STATIC, 'air'))).toBeLessThan(0.1);
  });
});

describe('the price alone', { timeout: 60_000 }, () => {
  // Without psychology the model is plain EV: call exactly when the equity beats the price
  // (raises left out - with them a pure EV player rightly bluff-raises what it thinks folds).
  test('a neutral player calls exactly when calling is +EV', () => {
    const s = { ...facingCbet(WET, 0.5), raiseSizes: [] };
    const d = decide(NEUTRAL, s, bb, hero);
    const eq = rangeEquity(bb, hero, cards(WET));
    const c = s.toCall / s.pot;
    const needed = c / (1 + 2 * c);
    let checked = 0;
    for (let combo = 0; combo < 1326; combo++) {
      const e = eq[combo]!;
      if (!(bb[combo]! > 0) || Number.isNaN(e) || Number.isNaN(d.probs[0]![combo]!)) continue;
      if (Math.abs(e - needed) < 0.03) continue;
      checked++;
      const fold = d.probs[d.options.findIndex((o) => o.kind === 'fold')]![combo]!;
      if (e < needed) expect(fold).toBeGreaterThan(0.99);
      else expect(fold).toBeLessThan(0.01);
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('sizes', { timeout: 60_000 }, () => {
  const RIVER = 'Ks 7d 2c 5h 9s';
  const river = (inPosition: boolean): Situation => ({ board: cards(RIVER), pot: 1000, toCall: 0, stack: 9000, oppStack: 9000, bb: 100, inPosition });

  // HHP-ewfxSHN09CU-38, HHP-VYx-LddJryw-47: strong hands "get a little more greedy" and size up.
  test('greed: strong hands bet bigger than thin value', () => {
    const d = decide(fish, river(true), hero, bb);
    const strong = avgBetSize(d, hero, 1000, bucketIs(RIVER, 'cpfs'));
    const thin = avgBetSize(d, hero, 1000, bucketIs(RIVER, 'thin'));
    expect(strong).toBeGreaterThan(thin);
  });

  // HHP-VYx-LddJryw-44/45: out of position, small river bets are cheap bluffs ("don't want the
  // embarrassment of having to show first"); in position, missed draws just check back.
  test('embarrassment: air bets less in position than out of position, and bluffs go small', () => {
    const ip = decide(fish, river(true), hero, bb);
    const oop = decide(fish, river(false), hero, bb);
    const air = bucketIs(RIVER, 'air');
    expect(shareOf(ip, hero, ['bet'], air)).toBeLessThan(shareOf(oop, hero, ['bet'], air));
    expect(avgBetSize(oop, hero, 1000, air)).toBeLessThan(avgBetSize(oop, hero, 1000, bucketIs(RIVER, 'cpfs')));
  });

  // HHP-iMpJnsP9NMs-41: recs check strong-ish hands on the river: "too scared to value bet thinly".
  // Against the thinking regs (TAG): the half-pot autopilot reg checks thin value too - his one size
  // is too big for it.
  test('recreational players value-bet thin rivers less than thinking regs', () => {
    const thin = bucketIs(RIVER, 'thin');
    const f = shareOf(decide(fish, river(true), hero, bb), hero, ['bet'], thin);
    const r = shareOf(decide(MOTIVE_PRESETS.TAG!, river(true), hero, bb), hero, ['bet'], thin);
    expect(f).toBeLessThan(r);
  });

  // HHP-wdLX7cybJvs-31: a small turn bet makes recs with strong hands fast-play: "They get greedy,
  // they don't want to see a bad river". (That they raise a small bet *more* than a big one was the
  // extraction's suggestion, not Mark's claim - it is Marius's pool read: sizeRead.test.ts.)
  test('strong hands raise a small turn bet', () => {
    const TURN = 'Js 9d 2s 4c';
    const d = decide(fish, { ...facingCbet(TURN, 1 / 3), pot: 900, toCall: 300 }, bb, hero);
    expect(shareOf(d, bb, ['raise'], bucketIs(TURN, 'cpfs'))).toBeGreaterThan(0.8);
  });
});

describe('fear of tough decisions, sessions and statuses', { timeout: 60_000 }, () => {
  // HHP-ewfxSHN09CU-36: "players just don't want to have to make a tough decision" - medium hands
  // spaz into all-ins when the pot is big and the stacks are short.
  test('at a low stack-to-pot ratio, fear of tough decisions turns medium hands into jams', () => {
    const s: Situation = { board: cards(WET), pot: 1000, toCall: 500, stack: 2000, oppStack: 1500, bb: 100, inPosition: false };
    const medium = bucketIs(WET, 'thin', 'sdv');
    const jams = (td: number) => {
      const d = decide({ ...fish, toughDecision: td }, s, bb, hero);
      return shareOf(d, bb, ['raise'], medium);
    };
    expect(jams(1.5)).toBeGreaterThan(jams(0) + 0.05);
  });

  // Smith, Levere & Kurtzman 2009; Eil & Lien 2014: losing players chase.
  test('a player behind in the session continues more with weak hands', () => {
    const s = facingCbet(WET, 0.75);
    const weak = bucketIs(WET, 'sdv', 'air', 'weak-draw');
    const even = shareOf(decide(fish, s, bb, hero), bb, ['call', 'raise'], weak);
    const stuck = shareOf(decide(withState(fish, { sessionBB: -150 }), s, bb, hero), bb, ['call', 'raise'], weak);
    expect(stuck).toBeGreaterThan(even);
  });

  // Alcohol: more risk (less loss aversion, long shots overweighted), less inhibition; rising
  // alcohol stimulates (aggression), falling alcohol sedates (calling).
  test('drinking: both fold less than sober; lively ones raise more, tired ones raise less and call more', () => {
    const s = facingCbet(WET);
    const sober = decide(fish, s, bb, hero);
    const lively = decide(withState(fish, { tags: ['drinking'] }), s, bb, hero);
    const tired = decide(withState(fish, { tags: ['drinking-tired'] }), s, bb, hero);
    const all = () => true;
    const at = (d: Decision, k: string) => shareOf(d, bb, [k], all);
    expect(at(lively, 'fold')).toBeLessThan(at(sober, 'fold'));
    expect(at(tired, 'fold')).toBeLessThan(at(sober, 'fold'));
    expect(at(lively, 'raise')).toBeGreaterThan(at(sober, 'raise'));
    expect(at(tired, 'raise')).toBeLessThan(at(sober, 'raise'));
    expect(at(tired, 'call')).toBeGreaterThan(at(sober, 'call'));
  });

  // HHP-dq1Jn4HfegA-25 ("he just want to get his money back so bad"), HHP-5I3oId9IV9k-43 (don't
  // bluff a stuck player), HHP-JqjtIXgR-kI-20 (stuck players overcall: overbet them for thin value).
  test('stuck: the status makes a player chase - more calls with weak hands, fewer folds', () => {
    const s = facingCbet(WET, 0.75);
    const weak = bucketIs(WET, 'sdv', 'air', 'weak-draw');
    const all = () => true;
    const even = decide(fish, s, bb, hero);
    const stuck = decide(withState(fish, { tags: ['stuck'] }), s, bb, hero);
    expect(shareOf(stuck, bb, ['call', 'raise'], weak)).toBeGreaterThan(shareOf(even, bb, ['call', 'raise'], weak));
    expect(shareOf(stuck, bb, ['fold'], all)).toBeLessThan(shareOf(even, bb, ['fold'], all));
  });

  test('protecting a win: a winning player folds more to a big bet', () => {
    const s = facingCbet(WET, 1);
    const all = () => true;
    const base: MotiveProfile = fish;
    expect(shareOf(decide(withState(base, { tags: ['winning'] }), s, bb, hero), bb, ['fold'], all)).toBeGreaterThan(shareOf(decide(base, s, bb, hero), bb, ['fold'], all));
  });
});

test('explain gives each option its motives, adding up to the score', { timeout: 30_000 }, () => {
  const d = decide(fish, facingCbet(WET), bb, hero);
  const [a, b] = cards('9h 9c'); // a set; JJ isn't in the big blind's range (it 3-bets)
  for (const x of d.explain(comboIndex(a!, b!))) {
    const w = x.weighted;
    expect(w.gain + w.loss + w.fear + w.trap + w.tough + w.embarrassment + w.liking).toBeCloseTo(x.score, 9);
  }
});

describe('position, scare cards, sizes and depth (batches 11-13)', { timeout: 120_000 }, () => {
  // HHP-CzhdeGrmJVI-19: in position "way less anxiety ... about bad turn cards coming that kill
  // their action": strong hands slow-play much more, even on wet boards.
  test('in position, sets raise a wet-board c-bet less than out of position', () => {
    const oop = decide(fish, facingCbet(WET), bb, hero);
    const ip = decide(fish, { ...facingCbet(WET), inPosition: true }, bb, hero);
    const sets = madeIs(WET, 'set');
    expect(shareOf(ip, bb, ['raise'], sets)).toBeLessThan(shareOf(oop, bb, ['raise'], sets) - 0.1);
  });

  // HHP-2RK1vrj9xhU-05/-11: on a river that changes the nuts they lead their strong hands ("not
  // expecting us to continue to value bet"), and that lead is almost never a bluff.
  test('a river lead after the flush gets there is strong: value hands lead more, fewer of the leads are bluffs', () => {
    const SCARY = 'Ks 8d 2s 3h 7s';
    const BLANK = 'Ks 8d 2s 3h Qh';
    expect(oppBetsOn(cards(SCARY))).toBeLessThan(oppBetsOn(cards(BLANK)));
    const river = (board: string): Situation => ({
      board: cards(board), pot: 1500, toCall: 0, stack: 8500, oppStack: 8500, bb: 100, inPosition: false,
      oppInitiative: true, oppBets: oppBetsOn(cards(board)),
    });
    const scared = decide(fish, river(SCARY), bb, hero);
    const usual = decide(fish, { ...river(SCARY), oppBets: undefined }, bb, hero);
    const strong = bucketIs(SCARY, 'cpfs', 'thick');
    expect(shareOf(scared, bb, ['bet'], strong)).toBeGreaterThan(shareOf(usual, bb, ['bet'], strong));
    // the bluffs' share of the lead range
    const air = bucketIs(SCARY, 'air');
    const bluffShare = (d: Decision) => {
      let v = 0;
      let t = 0;
      for (let c = 0; c < 1326; c++) {
        if (!(bb[c]! > 0) || Number.isNaN(d.probs[0]![c]!)) continue;
        const pBet = d.options.reduce((x, o, i) => x + (o.kind === 'bet' ? d.probs[i]![c]! : 0), 0);
        t += bb[c]! * pBet;
        if (air(c)) v += bb[c]! * pBet;
      }
      return v / t;
    };
    expect(bluffShare(scared)).toBeLessThan(bluffShare(usual));
  });

  // Not tested here: HHP-4VqO8f5PKuY-10/-11 and HHP-yrkrExta9ug-10 (a small bet on the flush turn
  // lets flushes raise, a big one scares them of a bigger flush so they flat). Against an
  // un-narrowed range the model raises flushes into any size; in a hand the bettor's range is
  // narrowed by the size first (story.ts), which is where this has to show - a case for the
  // "smells right?" page (ROADMAP step 12).

  // HHP-8-KBQ3GNrhQ (24:32): very deep, "risk aversion comes in" - regs fold strong hands.
  test('deep stacks: a reg folds more thick value to a pot-sized river bet at 300 BB than at 30 BB', () => {
    const RIVER = 'Ks 7d 2c 5h 9s';
    const at = (potBB: number): Situation => ({ board: cards(RIVER), pot: potBB * 100, toCall: potBB * 100, stack: potBB * 200, oppStack: potBB * 100, bb: 100, inPosition: false });
    const thick = bucketIs(RIVER, 'thick');
    const reg = MOTIVE_PRESETS.Reg!;
    expect(shareOf(decide(reg, at(300), bb, hero), bb, ['fold'], thick)).toBeGreaterThan(shareOf(decide(reg, at(30), bb, hero), bb, ['fold'], thick));
  });
});

describe('sizing habits (Marius, 2026-10-08: his 25c live game)', { timeout: 180_000 }, () => {
  const BOARDS = { flop: WET, turn: 'Js 9d 2s 4c', river: 'Ks 7d 2c 5h 9s' };
  /** In position, checked to: what the type's whole range bets. */
  const checkedTo = (type: string, board: string) =>
    decide(MOTIVE_PRESETS[type]!, { board: cards(board), pot: 1000, toCall: 0, stack: 9000, oppStack: 9000, bb: 100, inPosition: true }, hero, bb);
  /** Share of the bets (weighted by range and chance) whose size in pots passes `pick`. */
  const betShare = (d: Decision, pick: (size: number) => boolean, inGroup: (c: number) => boolean = () => true) => {
    let all = 0;
    let x = 0;
    for (let c = 0; c < 1326; c++) {
      if (!(hero[c]! > 0) || !inGroup(c) || Number.isNaN(d.probs[0]![c]!)) continue;
      d.options.forEach((o, i) => {
        if (o.kind !== 'bet') return;
        const w = hero[c]! * d.probs[i]![c]!;
        all += w;
        if (pick(o.amount / 1000)) x += w;
      });
    }
    return all > 0 ? x / all : NaN;
  };
  const half = (s: number) => Math.abs(s - 0.5) < 0.01;

  // "Most regs just go bet-bet-bet for half pot, regardless of their range, the board, or the number of opponents."
  test('the autopilot reg bets half pot on every street, whatever the hand', () => {
    for (const board of Object.values(BOARDS)) expect(betShare(checkedTo('Reg', board), half), board).toBeGreaterThan(0.95);
  });

  // "Raising habit is 3x, especially when the original bet was half pot."
  test('the autopilot reg raises a half-pot bet 3x', () => {
    const d = decide(MOTIVE_PRESETS.Reg!, facingCbet(WET, 0.5), bb, hero);
    let all = 0;
    let three = 0;
    for (let c = 0; c < 1326; c++) {
      if (!(bb[c]! > 0) || Number.isNaN(d.probs[0]![c]!)) continue;
      d.options.forEach((o, i) => {
        if (o.kind !== 'raise' || o.allIn) return;
        all += bb[c]! * d.probs[i]![c]!;
        if (o.label === 'Raise 3x') three += bb[c]! * d.probs[i]![c]!;
      });
    }
    expect(three / all).toBeGreaterThan(0.75);
  });

  // "Fish size up sometimes, especially on rivers. Some even bluff big, but extremely rarely."
  // "OTF they skew towards higher (2 thirds possibly), OTT and OTR they skew lower."
  // HHP-gc7faxBVjm8: recs bet big with strong hands, a third to half pot otherwise - the size tells.
  test('fish bet their usual size before the river; on the river the strong hands size up and air stays small', () => {
    expect(betShare(checkedTo('Fish', BOARDS.flop), (s) => s >= 0.49 && s <= 0.76)).toBeGreaterThan(0.6);
    expect(betShare(checkedTo('Fish', BOARDS.turn), (s) => s <= 0.51)).toBeGreaterThan(0.5);
    const river = checkedTo('Fish', BOARDS.river);
    const strong = bucketIs(BOARDS.river, 'cpfs');
    expect(avgBetSize(river, hero, 1000, strong)).toBeGreaterThan(0.8);
    expect(avgBetSize(river, hero, 1000, strong)).toBeGreaterThan(avgBetSize(checkedTo('Fish', BOARDS.flop), hero, 1000, bucketIs(BOARDS.flop, 'cpfs')));
    // big bluffs: almost never
    const air = bucketIs(BOARDS.river, 'air');
    expect(shareOf(river, hero, ['bet'], air) * betShare(river, (s) => s >= 1, air)).toBeLessThan(0.01);
  });

  // "Maniacs bet between half pot and pot, they very rarely overbet."
  test('maniacs bet between half pot and pot and rarely overbet', () => {
    for (const board of Object.values(BOARDS)) {
      const d = checkedTo('Maniac', board);
      expect(betShare(d, (s) => s >= 0.49 && s <= 1.01), board).toBeGreaterThan(0.85);
      expect(betShare(d, (s) => s > 1.01), board).toBeLessThan(0.1);
    }
  });

  test('nits bet small: overbets only with hands that can play for stacks', () => {
    for (const board of Object.values(BOARDS)) {
      const d = checkedTo('Nit', board);
      expect(avgBetSize(d, hero, 1000, () => true), board).toBeLessThan(0.55);
      expect(betShare(d, (s) => s > 1.01, (c) => !bucketIs(board, 'cpfs')(c)), board).toBeLessThan(0.02);
    }
  });

  // The thinking players size by payoff: big for value, smaller with thinner hands.
  test('thinking regs (TAG) have no habit: strong hands bet much bigger than thin value', () => {
    for (const board of Object.values(BOARDS)) {
      const d = checkedTo('TAG', board);
      expect(avgBetSize(d, hero, 1000, bucketIs(board, 'cpfs')), board).toBeGreaterThan(avgBetSize(d, hero, 1000, bucketIs(board, 'thin')) + 0.3);
    }
  });
});
