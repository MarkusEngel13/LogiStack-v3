/**
 * The check-raise all-in with a pair under the top card (Marius's home game, TODO 65): a player's
 * own move, set on the Players page or by the wizard's question. Spot: the button opened, the big
 * blind (a Fish) called, checks and faces a half-pot c-bet; ranges as in the doctrine tests.
 */

import { describe, expect, test } from 'vitest';
import { comboIndex, parseCards } from '../cards';
import { equityVsRange } from '../equity/equity';
import { classifyAll } from '../handClass';
import { parseRange } from '../ranges/notation';
import { styleMotives, typeSettings, type PairJam } from '../players/style';
import { decide, rangeAfter, type Decision, type Situation } from './decide';
import { sprFacing } from './pairJam';
import { MOTIVE_PRESETS } from './profile';
import { exploreSizes } from './sizes';

const hero = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
const BB = '22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o';
const bb = parseRange(BB);
const cards = (t: string) => parseCards(t.split(' '));
const WET = 'Jh 8h 4c';

/** A Fish with the habit at a level (0 = never). */
const fish = (pairJam: PairJam) => styleMotives({ ...typeSettings('Fish'), pairJam }, MOTIVE_PRESETS);

/** Facing a half-pot c-bet: `pot` before it, `stack` behind before it. */
const cbet = (board: string, pot: number, stack: number, extra: Partial<Situation> = {}): Situation => ({
  board: cards(board),
  pot,
  toCall: pot / 2,
  stack,
  oppStack: stack - pot / 2,
  bb: 100,
  inPosition: false,
  ...extra,
});
/** A 3-bet pot: 99 BB behind, 22 BB in the middle - SPR 3 facing the c-bet. */
const spr3 = (board: string, extra?: Partial<Situation>) => cbet(board, 2200, 9900, extra);
/** 100 BB in a single-raised pot: SPR 10 (all-in kept on the menu, as when it happened). */
const spr10 = (board: string) => cbet(board, 650, 9750, { allInAlways: true });
/** Short-stacked: SPR 1.5. */
const spr15 = (board: string) => cbet(board, 2200, 4950);

const isAllIn = (d: Decision) => d.options.findIndex((o) => o.kind === 'raise' && o.allIn);

/** Share of the combos of `hands` (range notation) that check-raise all-in. */
function jams(d: Decision, hands: string, range = bb): number {
  const mask = parseRange(hands);
  const j = isAllIn(d);
  let w = 0;
  let x = 0;
  for (let c = 0; c < 1326; c++) {
    if (!(mask[c]! > 0) || !(range[c]! > 0) || Number.isNaN(d.probs[0]![c]!)) continue;
    w += range[c]!;
    if (j >= 0) x += range[c]! * d.probs[j]![c]!;
  }
  return w > 0 ? x / w : NaN;
}

/** Every probability of two decisions is the same, for the combos `keep` picks. */
function same(a: Decision, b: Decision, keep: (combo: number) => boolean = () => true) {
  expect(b.options.map((o) => o.label)).toEqual(a.options.map((o) => o.label));
  for (let i = 0; i < a.options.length; i++) {
    for (let c = 0; c < 1326; c++) {
      if (keep(c)) expect(Object.is(a.probs[i]![c], b.probs[i]![c]) || a.probs[i]![c] === b.probs[i]![c]).toBe(true);
    }
  }
}

describe('the check-raise all-in with a pair under the top card', { timeout: 120_000 }, () => {
  const never = decide(fish(0), spr3(WET), bb, hero);
  const sometimes = decide(fish(1), spr3(WET), bb, hero);
  const often = decide(fish(2), spr3(WET), bb, hero);

  test('a Fish who does it very often jams most of his 99 and TT on J♥8♥4♣ facing a c-bet at SPR 3', () => {
    expect(sprFacing(spr3(WET))).toBeCloseTo(3, 5);
    expect(jams(never, '99')).toBeLessThan(0.05);
    expect(jams(often, '99')).toBeGreaterThan(0.5);
    expect(jams(often, 'TT')).toBeGreaterThan(0.5);
    // now and then: about one in four
    expect(jams(sometimes, '99')).toBeGreaterThan(0.15);
    expect(jams(sometimes, '99')).toBeLessThan(0.4);
    // second pair (a board card paired) sometimes, far less than the pocket pairs
    const second = jams(often, 'A8s, K8s, Q8s, 98s, 87s, 86s, 85s');
    expect(second).toBeGreaterThan(jams(never, 'A8s, K8s, Q8s, 98s, 87s, 86s, 85s') + 0.1);
    expect(second).toBeLessThan(jams(often, '99') / 2);
  });

  test('100 BB deep in a single-raised pot (SPR 10) he rarely does it', () => {
    expect(sprFacing(spr10(WET))).toBeCloseTo(10, 5);
    const deep = decide(fish(2), spr10(WET), bb, hero);
    expect(jams(deep, '99')).toBeLessThan(0.12);
    expect(jams(deep, '99')).toBeGreaterThan(jams(decide(fish(0), spr10(WET), bb, hero), '99'));
    // ...and a jam of 15 pots isn't even on his menu unless it happened
    expect(isAllIn(decide(fish(2), { ...spr10(WET), allInAlways: false }, bb, hero))).toBe(-1);
  });

  test('level never is the Fish exactly as before', () => {
    const p = fish(0);
    expect('pairJam' in p).toBe(false);
    expect(p).toEqual(MOTIVE_PRESETS.Fish);
    same(decide(MOTIVE_PRESETS.Fish!, spr3(WET), bb, hero), never);
  });

  test('hands outside the habit decide as before: overpairs, top pair, sets, draws, air', () => {
    const wide = parseRange(`${BB}, QQ+`);
    const cls = classifyAll(cards(WET));
    const habit = (c: number) => ['second-pair', 'third-pair', 'low-pair'].includes(cls[c]?.made ?? '');
    same(decide(fish(0), spr3(WET), wide, hero), decide(fish(2), spr3(WET), wide, hero), (c) => !habit(c));
    expect(jams(decide(fish(2), spr3(WET), wide, hero), 'QQ', wide)).toBe(jams(decide(fish(0), spr3(WET), wide, hero), 'QQ', wide));
  });

  test('more when the draws scare him: 99 jams more on J♥8♥4♣ than under the king of K♣7♦2♠', () => {
    const dry = decide(fish(2), spr3('Kc 7d 2s'), bb, hero);
    expect(jams(dry, '99')).toBeGreaterThan(0.3); // a habit still: "or for whatever other reason"
    expect(jams(often, '99')).toBeGreaterThan(jams(dry, '99') + 0.08);
  });

  test('short-stacked he jams weaker pairs too, against a range he reads as unpaired (AK, ace-high)', () => {
    const short = decide(fish(2), spr15(WET), bb, hero);
    const shortNever = decide(fish(0), spr15(WET), bb, hero);
    expect(jams(short, '55, 66, 77')).toBeGreaterThan(jams(shortNever, '55, 66, 77') + 0.25);
    // at SPR 3 the weaker pairs hardly
    expect(jams(often, '55, 66, 77')).toBeLessThan(0.1);
    // against a range he reads as all pairs (overpairs, top pair) the weaker ones stay put
    const paired = parseRange('QQ+, AJs, KJs');
    expect(jams(decide(fish(2), spr15(WET), bb, paired), '55, 66, 77')).toBeCloseTo(jams(decide(fish(0), spr15(WET), bb, paired), '55, 66, 77'), 6);
  });

  test('the turn too; never the river, in position or facing a raise of his own bet', () => {
    const turn = 'Jh 8h 4c 2s';
    expect(jams(decide(fish(2), spr3(turn), bb, hero), '99')).toBeGreaterThan(0.4);
    const river = 'Jh 8h 4c 2s 3d';
    same(decide(fish(0), spr3(river), bb, hero), decide(fish(2), spr3(river), bb, hero));
    same(decide(fish(0), spr3(WET, { inPosition: true }), bb, hero), decide(fish(2), spr3(WET, { inPosition: true }), bb, hero));
    same(decide(fish(0), spr3(WET, { facingRaise: true }), bb, hero), decide(fish(2), spr3(WET, { facingRaise: true }), bb, hero));
  });

  test('his all-in now holds the pairs: queens call it with more equity (the range story)', () => {
    const range = (d: Decision) => rangeAfter(d, isAllIn(d), bb);
    const eq = (d: Decision) => equityVsRange(cards('Qs Qd'), cards(WET), range(d)).equity;
    expect(eq(often)).toBeGreaterThan(eq(never) + 0.1);
  });

  test('the bot holding 99 draws from the same chances (one hand, as bot.ts decides)', () => {
    const combo = comboIndex(parseCards(['9c'])[0]!, parseCards(['9d'])[0]!);
    const one = new Float32Array(1326);
    one[combo] = 1;
    const d = decide(fish(2), spr3(WET), one, hero);
    expect(d.probs[isAllIn(d)]![combo]).toBeCloseTo(often.probs[isAllIn(often)]![combo]!, 5);
    expect(d.probs[isAllIn(d)]![combo]).toBeGreaterThan(0.5);
  });

  test('the why: the habit shows as his liking for the all-in, and the scores still add up to the chances', () => {
    const combo = comboIndex(parseCards(['9c'])[0]!, parseCards(['9d'])[0]!);
    const a = never.explain(combo)[isAllIn(never)]!;
    const b = often.explain(combo)[isAllIn(often)]!;
    expect(b.weighted.liking).toBeGreaterThan(a.weighted.liking);
    expect(b.weighted.gain).toBe(a.weighted.gain);
    // a soft choice over the explained scores gives the decision's chances
    const scores = often.explain(combo).map((x) => x.score);
    const top = Math.max(...scores);
    const e = scores.map((s) => Math.exp((s - top) / fish(2).noise));
    const sum = e.reduce((x, y) => x + y, 0);
    e.forEach((x, i) => expect(x / sum).toBeCloseTo(often.probs[i]![combo]!, 5));
  });
});

describe('the EV table: betting into him', { timeout: 120_000 }, () => {
  // the button bets half pot with top pair top kicker in the 3-bet pot (SPR 3 once the Fish faces it)
  const ask = (pairJam: PairJam) =>
    exploreSizes({
      situation: { board: cards(WET), pot: 2200, toCall: 0, stack: 9900, oppStack: 9900, bb: 100, inPosition: true },
      actor: { profile: MOTIVE_PRESETS.Reg!, range: hero, cards: cards('Ad Jd') },
      others: [{ seat: 2, profile: fish(pairJam), range: bb }],
    }).rows.find((r) => r.label === 'Bet ½ pot')!;

  test('his jams hold the pairs, so the bet is worth more: top pair calls them and wins', () => {
    const never = ask(0);
    const often = ask(2);
    expect(often.raise).toBeGreaterThan(never.raise + 0.03);
    expect(often.ev!).toBeGreaterThan(never.ev!);
  });
});
