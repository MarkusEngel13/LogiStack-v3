/**
 * What a player *believes* the other side does when bet into: the share of each bucket that
 * continues against a bet of a given size (in pots). Not the truth - the rule of thumb a live
 * player bets with ("they won't call a big bet without a real hand", HHP: elastic vs inelastic).
 * Strong hands stay whatever the size; weak ones drop out as the size grows.
 *
 * This is what makes the board matter for the bettor: on a wet board the other range is full of
 * pairs and draws that keep calling (bet, get paid), on a static board it is mostly air that
 * folds to any bet (check, let them catch up or bluff) - HHP's "will they call with their weak
 * stuff?".
 *
 * The other way round, the size read: what a bet's size says to the player facing it about the
 * bettor's later bets (a small bet reads weak, a big one strong) - the trap of a strong hand's call.
 */

import { BUCKETS, type Bucket } from '../buckets';

/**
 * Continue share at size 0, how fast it decays per pot of bet size, and the floor it never goes
 * below (some of every bucket is too sticky or too curious to fold - "they never fold top pair").
 * Mostly inelastic (HHP): top pair and good draws pay big bets, weak hands fold to any bet - so
 * a small bet gets most of the folds a big one gets. (Steeper decays made every bluff an overbet.)
 */
const TABLE: Record<Bucket, [base: number, decay: number, floor: number]> = {
  cpfs: [1, 0, 1],
  thick: [1, 0.15, 0.3],
  thin: [0.8, 0.3, 0.1],
  sdv: [0.5, 0.45, 0.04],
  'strong-draw': [0.9, 0.2, 0.2],
  'weak-draw': [0.45, 0.5, 0.03],
  air: [0.15, 0.45, 0.01],
};

/** Against a raise, the believed folds are this share of those against a bet: "he bet, he has something". */
const RAISE_FOLDS = 1;

/**
 * Believed continue share of a bucket against a bet of `size` pots (a raise: the raise above the
 * call, in pots after the call). `foldBelief` sharpens it: 1 = the population's rule of thumb,
 * 2 = "big bets fold everything", 0.5 = "nobody folds".
 */
export function believedContinue(bucket: Bucket, size: number, foldBelief = 1, raise = false): number {
  const [base, decay, floor] = TABLE[bucket];
  let c = Math.max(Math.min(base, floor), base * Math.exp(-decay * size));
  if (raise) c = 1 - (1 - c) * RAISE_FOLDS;
  return c ** foldBelief;
}

/**
 * The size read (Marius's pool, 2026-10-10): what a bet's size says about the bettor to the player
 * facing it - how often he bets again on the next street when called. A small bet reads weak, a
 * stab that gives up when called: a monster raises it now to get paid. A big bet reads strong, he
 * will keep betting: a monster just calls and lets him. (HHP-4VqO8f5PKuY-10/-11 point the same
 * way for another reason: a small bet lets the strong hands raise, a big one makes them flat.)
 * A third of the pot: 40 %, half: 50 %, pot: 80 %, never above 90 %.
 */
const BARREL = { base: 0.2, perPot: 0.6, max: 0.9 };

export function believedBarrel(size: number): number {
  return Math.min(BARREL.max, BARREL.base + BARREL.perPot * Math.max(0, size));
}

/**
 * What a bettor of `size` pots is believed to put in on each later street when called, in pots: he
 * bets again as often as his size reads strong, about as much as now.
 */
export function laterBets(size: number): number {
  return believedBarrel(size) * Math.max(0, size);
}

/** The whole table, for the screen. */
export const BELIEF_TABLE: readonly { bucket: Bucket; base: number; decay: number; floor: number }[] = BUCKETS.map((b) => ({
  bucket: b,
  base: TABLE[b][0],
  decay: TABLE[b][1],
  floor: TABLE[b][2],
}));
