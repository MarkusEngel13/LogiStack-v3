/**
 * A player's own move (Marius's home game): the check-raise all-in with a pocket pair under the
 * top card and above the second - 99 on J-8-4 - on the flop or the turn, "I'm ahead now, let's get
 * it in before the draws get there". Sometimes with second pair too (A8 on J-8-4). Short-stacked
 * he also jams weaker pairs, the more of the bettor's range he reads as unpaired (AK, ace-high,
 * draws): any pair beats those.
 *
 * Only at a sane stack-to-pot ratio: a fish doesn't check-raise ten times the pot. SPR here = the
 * chips behind over the pot with the bet in it, as players count it facing a c-bet: 90 BB behind
 * in a 22 BB 3-bet pot facing a third-pot c-bet is 3; 100 BB in a single-raised pot is about 10.
 *
 * It is a habit, not a calculation: a share of those hands jams whatever the motives say (the
 * level, style.ts's pairJam, sets the share), the rest decide as before. decide.ts turns the share
 * into a liking for the all-in raise, so the story, the bots and the EV table all see it.
 */

import { cardsFromComboIndex, rankOf } from '../cards';
import type { HandClass } from '../handClass';
import type { Weights } from '../ranges/range';
import type { Situation } from './decide';

/** At this SPR or less the habit is at full strength; deeper it fades with the square (4: 56 %, 6: 25 %, 10: 9 %). */
export const FULL_SPR = 3;
/** The weaker pairs jam only short-stacked: full at this SPR, then a steeper fade, with the cube (2: 42 %, 3: 13 %). */
export const SMALL_SPR = 1.5;
/** Second pair (a board card paired, A8 on J-8-4) jams this share as often as the pocket pairs: "sometimes". */
export const SECOND_PAIR = 0.35;
/**
 * The draws he fears: his hand's felt fear (decide.ts's `scary`: the share of next cards that bite
 * into its lead, two cards to come count 1.5x; no texture labels). A hand with nothing to fear
 * still jams this share as often as a scared one ("or for whatever other reason"). 99 on J-8-4
 * with two hearts feels 0.86 (jams at 91 % of the level's share), on K-7-2 rainbow 0.51 (68 %).
 */
const FEAR_FLOOR = 0.35;
/** Never every hand: some of them always do what they would have done. */
const MOST = 0.95;

const NO_PAIR = new Set(['ace-high', 'king-high', 'air']);

/** The SPR of a decision facing a bet: chips behind (the most that can go in) over the pot with the bet in it. */
export function sprFacing(s: Situation): number {
  const behind = Math.min(s.stack, s.toCall + s.oppStack);
  return behind / Math.max(1, s.pot + s.toCall);
}

/** Share of a range (weights) that holds no pair on this board: what he reads as AK, ace-high, draws. */
export function unpairedShare(w: Weights, classes: readonly (HandClass | null)[]): number {
  let all = 0;
  let none = 0;
  for (let c = 0; c < 1326; c++) {
    const h = classes[c];
    const v = w[c]!;
    if (!h || !(v > 0)) continue;
    all += v;
    if (NO_PAIR.has(h.made)) none += v;
  }
  return all > 0 ? none / all : 0;
}

/**
 * Per combo, the share that check-raises all-in out of habit (0 = decides as usual), or null when
 * the spot doesn't fit: `rate` = the profile's pairJam; facing the first bet of the street after
 * checking (out of position, heads-up), on the flop or turn, with a raise possible. `opp` = the
 * bettor's range as he sees it; `scary` = each combo's felt fear (decide.ts).
 */
export function pairJamShares(
  rate: number | undefined,
  s: Situation,
  classes: readonly (HandClass | null)[],
  opp: readonly Weights[],
  scary: Float32Array,
): Float32Array | null {
  if (!rate || rate <= 0 || s.toCall <= 0 || s.facingRaise || s.inPosition || s.board.length > 4 || opp.length !== 1) return null;
  if (Math.min(s.stack, s.toCall + s.oppStack) <= s.toCall) return null; // no chips left to raise
  const spr = sprFacing(s);
  const deep = Math.min(1, (FULL_SPR / spr) ** 2);
  const short = Math.min(1, (SMALL_SPR / spr) ** 3) * unpairedShare(opp[0]!, classes);
  // the board's second rank: a pocket pair must sit above it (on J-8-8, 55 counts as second pair but is under the eights)
  const second = [...new Set(s.board.map(rankOf))].sort((a, b) => b - a)[1] ?? -1;
  const out = new Float32Array(1326);
  for (let c = 0; c < 1326; c++) {
    const h = classes[c];
    if (!h) continue;
    // fear of the draws: the hand's own felt fear, from the floor up
    const fear = FEAR_FLOOR + (1 - FEAR_FLOOR) * Math.min(1, scary[c] ?? 0);
    let x = 0;
    if (h.made === 'second-pair') {
      if (!h.pocket) x = deep * fear * SECOND_PAIR;
      else if (rankOf(cardsFromComboIndex(c)[0]) > second) x = deep * fear;
    }
    // short-stacked, any weaker pair against a range he reads as unpaired
    if (h.made === 'second-pair' || h.made === 'third-pair' || h.made === 'low-pair') x = Math.max(x, short);
    if (x > 0) out[c] = Math.min(MOST, rate * x);
  }
  return out;
}
