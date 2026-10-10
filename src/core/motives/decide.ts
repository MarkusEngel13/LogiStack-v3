/**
 * The motive model: how a player acts, for every combo of their range, at one decision -
 * checked to or first to act (check / bet sizes) or facing a bet (fold / call / raise sizes).
 *
 * Every option gets a score in pots, made only of motives (profile.ts weighs them):
 *   greed          x what the option can win (the pot if they fold, the pot plus their call if called and ahead)
 *   loss aversion  x what it can lose (more for amounts past the player's comfort)
 *   fear           x the lead the next cards can take (scary cards; betting or raising "protects")
 *   trap           x the worse hands kept in for later streets (delayed gratification); a strong hand
 *                    facing a bet counts on the bettor's later bets as his size reads them (beliefs.ts:
 *                    a small bet reads weak - raise it now; a big one strong - call, he keeps betting),
 *                    on a safe board also on its own later bets, and on the turn it no longer waits
 *   tough decision x how likely the line leaves a medium hand in a hard spot (a jam ends it)
 *   embarrassment  x a bluff called and shown (river)
 *   + a liking for betting (aggression) or for calling (stickiness), and for the usual sizes (habit)
 *   + a move of his own: the check-raise all-in with a pair under the top card (pairJam.ts)
 * and the player picks by a soft choice (noise). The fold is the zero.
 *
 * What the player believes about the other side - who folds to which size - is beliefs.ts; the
 * cards are exact: equity against the other range, how far ahead the hand is now, its scary
 * cards (fear.ts), and the same against the part of the range that keeps going after a bet.
 */

import { BUCKETS, bucketOf, type Bucket } from '../buckets';
import type { Card } from '../cards';
import { fromParts, partsByGroup, type GroupParts } from '../equity/field';
import { fearNumbers } from '../fear';
import { classifyAll } from '../handClass';
import type { Weights } from '../ranges/range';
import { nutsChanged } from '../texture';
import { believedContinue, laterBets } from './beliefs';
import { pairJamShares } from './pairJam';
import type { MotiveProfile } from './profile';

export interface Situation {
  board: Card[];
  /** Chips in the middle before the bet being faced (or before acting when not facing one). */
  pot: number;
  /** Chips to call; 0 = not facing a bet. */
  toCall: number;
  /** The actor's chips behind, before acting. */
  stack: number;
  /** The other player's chips behind, after any bet they made (multiway: the biggest stack). */
  oppStack: number;
  bb: number;
  /** The actor acts last on this street. */
  inPosition: boolean;
  /** Bet sizes in pots when not facing a bet. Default ⅓, ½, ¾, pot, 1.5 pots and the player's usual size (plus all-in). */
  betSizes?: number[];
  /** Raise-to sizes as multiples of the bet faced. Default 2.5x, 3.5x and the player's usual raise (plus all-in). */
  raiseSizes?: number[];
  /** All-in stays on the menu even when it is many pots (it was taken: the story needs it). */
  allInAlways?: boolean;
  /**
   * The other player bet or raised last (an earlier street, e.g. the preflop raiser) and acts
   * after: their bet is expected, so a check keeps the check-raise and rarely gives a free card.
   */
  oppInitiative?: boolean;
  /**
   * This player bet or raised last (the preflop raiser on the flop, the flop bettor on the turn):
   * a bet now is a continuation bet, which the player's c-bet habit likes (profile.cbetHabit).
   */
  initiative?: boolean;
  /**
   * How often this player expects the one with the initiative to bet when checked to (default
   * OPP_BETS). Lower after a card that changed the nuts (`oppBetsOn`): they expect a check, so
   * their strong hands lead.
   */
  oppBets?: number;
  /**
   * Players still to act after this one on this street (multiway): a call keeps them in, so a
   * strong hand flats to string them along (HHP: a call next to act is not capped).
   */
  behind?: number;
  /** The bet faced is a raise of this player's own bet (a check-raise, a re-raise). */
  facingRaise?: boolean;
}

export type OptionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface Option {
  kind: OptionKind;
  /** Chips this action puts in: the bet, the call, or the raise-to total. */
  amount: number;
  allIn: boolean;
  label: string;
}

/** What each motive contributes before the profile's weights, in pots. */
export interface Motives {
  gain: number;
  loss: number;
  fear: number;
  trap: number;
  tough: number;
  embarrassment: number;
  liking: number;
}

export interface Explained {
  option: Option;
  /** Final score, pots. */
  score: number;
  /** Raw motive amounts. */
  motives: Motives;
  /** The same, weighted by the profile (gain and trap positive, the rest negative). */
  weighted: Motives;
}

export interface Decision {
  options: Option[];
  /** probs[option][combo]; NaN where the combo isn't in the range. */
  probs: Float32Array[];
  /** Weighted share of each option over the whole range. */
  shares: number[];
  /** The same per bucket (main bucket of the actor's combos). */
  byBucket: Partial<Record<Bucket, { combos: number; shares: number[] }>>;
  /** Per combo: equity, share of the other range beaten now, felt fear (scary, two cards to come
   * count 1.5x) and the plain share of next cards that bite into the lead (0 on the river). */
  facts: { equity: Float32Array; ahead: Float32Array; scary: Float32Array; bites: Float32Array };
  /** How one combo weighs each option. */
  explain(combo: number): Explained[];
}

export const DEFAULT_BETS = [1 / 3, 0.5, 0.75, 1, 1.5];
/** A next card "bites" when it takes this share of the hand's lead or more. */
const BITE = 0.06;
/** What worse hands kept in are expected to pay per street to come, in pots (delayed gratification). */
const TRAP = 0.5;
/** All-in is on the menu only when it is not absurd: at most this many pots (after a call). */
const MAX_JAM_POTS = 3;
/**
 * Facing a raise of one's own bet, it reads like a bet this many pots bigger (see `read`), and
 * everyone who doesn't suspect big bets respects it at least this much: check-raises are
 * underbluffed, and even recreational players have learned it - they fold more to a check-raise
 * than to an overbet of the same size (Marius, HHP).
 */
const RAISE_READ = 1.5;
const RAISE_RESPECT = 0.45;
/**
 * How embarrassing a called bluff is before the river, against a river bluff shown down (1): a
 * called flop or turn stab isn't seen yet (players over-stab, HHP), a called bluff-raise is.
 */
const EMBARRASS_BET = { flop: 0.4, turn: 0.6 };
/** Each extra player in the pot is one more witness to a caught bluff (the audience effect). */
const AUDIENCE = 0.5;
const EMBARRASS_RAISE = 0.8;
/** How often a player expects the one with the initiative to bet when checked to. */
export const OPP_BETS = 0.6;
/**
 * The same after a card that changed the nuts (the flush or a straight got there, the board
 * paired): they expect the bettor to check, "they are not expecting us to continue to value bet
 * because they would not continue to value bet" - so they lead their strong hands, and a river
 * lead on a nut-changing card is almost never a bluff (HHP-2RK1vrj9xhU-05, -11).
 */
export const OPP_BETS_SCARY = 0.3;
/** What a player out of position expects from the one with the initiative on this board. */
export const oppBetsOn = (board: readonly Card[]) => (nutsChanged(board) ? OPP_BETS_SCARY : OPP_BETS);
/**
 * In position the fear of a bad next card is smaller: the player sees what the other does first
 * and keeps control of the pot, so strong hands slow-play more, even on wet boards ("way less
 * anxiety ... about bad turn cards coming that kill their action", HHP-CzhdeGrmJVI-19).
 */
const IP_FEAR = 0.7;
/**
 * ...and a trap is worth more in position: the trapper sees the bettor act first on every street
 * and decides how big the pot gets, so a flat or a check-back keeps more value than out of position.
 */
const IP_TRAP = 1.8;
/**
 * What a flat call is worth per player still to act behind, in pots: they stay in now (no card
 * comes first), may call or raise into the strong hand, and pay later streets.
 */
const TRAP_BEHIND = 1;
/**
 * What a hand that feels like the nuts makes of each chip the bettor is believed to put in later
 * (the size read, beliefs.ts) when it just calls: more than the chip - every bet it lets him make
 * grows the pot for its own raise later ("let him bet, raise him later"). Calibrated: a half-pot
 * bettor's later bets are worth half again the usual trap (TRAP), a third-pot stab's a fifth less.
 */
const BARRELS = 3;
/**
 * A trap is a street of waiting (Marius's pool: "they wait a street, then raise the turn"): a call
 * on the flop keeps the turn raise and the river to come; on the turn it leaves only the river,
 * where a raise gets called by better hands only (HHP-hb5V55q-tTU-41/42). So with one street left
 * a strong hand's call counts this share of it, and it raises the turn instead.
 */
const WAIT_LAST = 0.25;
export const DEFAULT_RAISES = [2.5, 3.5];

/** The menu with the player's usual size on it (when it isn't there already). */
export const withHabit = (sizes: readonly number[], usual: number) =>
  usual > 0 && !sizes.some((x) => Math.abs(x - usual) < 0.01 * usual) ? [...sizes, usual] : [...sizes];

/**
 * Tversky-Kahneman probability weighting, overweighting side only: long shots feel bigger than
 * they are (draws get chased), but a big favourite is not shrunk - a set facing a shove feels
 * like a set. (The full inverse-S made sets fold to shoves; the fear of big bets is `respect`.)
 */
const weigh = (p: number, g: number) => {
  if (g === 1 || p <= 0 || p >= 1) return p;
  const a = p ** g;
  return Math.max(p, a / (a + (1 - p) ** g) ** (1 / g));
};
/** 1 for a coin flip, 0 for a sure winner or loser: how hard a spot is with this equity. */
const mid = (x: number) => Math.max(0, 4 * x * (1 - x));

interface Aggro {
  option: Option;
  /** Believed share that everyone folds. */
  fold: number;
  /** Bet size in pots, as the others see it. */
  size: number;
  /** Equity and lead when someone continues (against the continuing parts of the ranges). */
  eq: Float32Array;
  ahead: Float32Array;
  /** Expected number of callers when someone continues (1 heads-up). */
  callers: number;
}

/**
 * Per combo, the chance to beat everyone present: the product of the per-opponent arrays, each
 * opponent counting only as far as they are there (`pres`: 1 = in, 0.4 = in four times in ten;
 * beating an absent player is free). NaN anywhere stays NaN.
 */
// ---- the range-against-range work, kept for a moment -----------------------------------------------
// The equity parts and fear numbers depend on the two ranges and the board only, not on who plays
// them: the same question asked again with another player profile (the size explorer's stability
// check, a slider dragged back and forth) reuses them. Exact - only a lookup. The results are
// read, never written.

/** A key for a range: FNV-1a over its weights. */
function rangeKey(w: Weights): string {
  let h = 2166136261;
  let n = 0;
  for (let c = 0; c < 1326; c++) {
    const v = w[c]!;
    if (v === 0) continue;
    n++;
    h = Math.imul(h ^ c, 16777619);
    h = Math.imul(h ^ Math.round(v * 1e6), 16777619);
  }
  return `${(h >>> 0).toString(36)}.${n}`;
}

const MEMO_SIZE = 48;
const memo = new Map<string, unknown>();
function remember<T>(key: string, make: () => T): T {
  const hit = memo.get(key);
  if (hit !== undefined) {
    memo.delete(key);
    memo.set(key, hit); // most recent last
    return hit as T;
  }
  const v = make();
  memo.set(key, v);
  if (memo.size > MEMO_SIZE) memo.delete(memo.keys().next().value!);
  return v;
}

function product(arrays: readonly Float32Array[], pres?: readonly number[]): Float32Array {
  const out = new Float32Array(1326).fill(1);
  arrays.forEach((a, i) => {
    const q = pres?.[i] ?? 1;
    for (let c = 0; c < 1326; c++) out[c]! *= 1 - q + q * a[c]!;
  });
  return out;
}

/**
 * `opp`: the other range, or (multiway) the ranges of everyone else still in. Against several the
 * hand has to beat them all: equity and lead are the products of the heads-up ones, a card is
 * scary if it hurts the hand against anyone, a bet wins the pot only if everyone folds and each
 * caller adds to it.
 *
 * `presence` (multiway, same order as `opp`): how likely each one is still in when this player
 * acts - for a player answering a bet after others who may have folded or called (the size
 * explorer). Default: everyone is in.
 */
export function decide(p: MotiveProfile, s: Situation, mine: Weights, opp: Weights | readonly Weights[], presence?: readonly number[]): Decision {
  const opps: readonly Weights[] = opp instanceof Float32Array ? [opp] : opp;
  const pres = opps.map((_, i) => Math.min(1, Math.max(0, presence?.[i] ?? 1)));
  const { board, pot: P, toCall: C, bb } = s;
  if (board.length < 3) throw new Error('The motive model starts on the flop');
  const streetsLeft = 5 - board.length;
  const river = streetsLeft === 0;
  const usualBet = p.betHabit[board.length - 3] ?? 0;
  const classes = classifyAll(board);
  const buckets = classes.map((h) => (h ? bucketOf(h) : null));

  // Equity and lead against each opponent, split by the opponent's buckets in one pass each: a
  // bet's continuing range is the buckets scaled by how often each goes on, so every bet size is
  // a re-weighting of these parts, not a new run over the board (exact, and many times faster).
  const G = BUCKETS.length;
  const group = buckets.map((b) => (b ? BUCKETS.indexOf(b) : -1));
  const ALL = new Array<number>(G).fill(1);
  const boardKey = board.join(',');
  const mineKey = rangeKey(mine);
  const oppKeys = opps.map(rangeKey);
  const eqParts: GroupParts[] = opps.map((o, i) => remember(`p1|${boardKey}|${mineKey}|${oppKeys[i]}`, () => partsByGroup(mine, o, board, group, G, true)));
  const nowParts: GroupParts[] = opps.map((o, i) => remember(`p0|${boardKey}|${mineKey}|${oppKeys[i]}`, () => partsByGroup(mine, o, board, group, G, false)));
  const equity = product(eqParts.map((q) => fromParts(q, ALL)), pres);
  // Felt fear: the share of next cards that would bite into the hand's lead at all (people count
  // the cards that "could" hurt, not how likely the opponent holds the hand), two cards to come
  // scare more than one. 0 on the river.
  let ahead: Float32Array;
  const scary = new Float32Array(1326);
  const bites = new Float32Array(1326);
  if (river) {
    ahead = product(nowParts.map((q) => fromParts(q, ALL)), pres);
  } else {
    const frs = opps.map((o, i) => remember(`f|${boardKey}|${mineKey}|${oppKeys[i]}`, () => fearNumbers(mine, o, board)));
    ahead = product(frs.map((f) => f.ahead), pres);
    const cardsToCome = streetsLeft === 2 ? 1.5 : 1;
    for (let combo = 0; combo < 1326; combo++) {
      const A = ahead[combo]!;
      if (Number.isNaN(A) || A <= 0) continue;
      let n = 0;
      let seen = 0;
      for (const card of frs[0]!.nextCards) {
        // a card bites if it takes a real part of the lead against anyone (who is there)
        let counted = false;
        let spared = 1;
        frs.forEach((fr, i) => {
          const o = fr.outdrawn[combo * 52 + card]!;
          if (Number.isNaN(o)) return;
          counted = true;
          if (o >= BITE * fr.ahead[combo]!) spared *= 1 - pres[i]!;
        });
        if (!counted) continue;
        seen++;
        n += 1 - spared;
      }
      bites[combo] = seen > 0 ? n / seen : 0;
      scary[combo] = Math.min(1, bites[combo]! * cardsToCome);
    }
  }

  // ---- options ---------------------------------------------------------------------------
  const options: Option[] = [];
  const aggro: Aggro[] = [];
  const facing = C > 0;

  const addAggro = (kind: 'bet' | 'raise', amount: number, maxAmount: number, label: string) => {
    const amt = Math.min(Math.round(amount), maxAmount);
    if (amt <= (kind === 'raise' ? C : 0) || options.some((o) => o.kind === kind && o.amount === amt)) return;
    const allIn = amt >= maxAmount;
    const option: Option = { kind, amount: amt, allIn, label: allIn ? 'All-in' : label };
    const size = kind === 'bet' ? amt / P : (amt - C) / (P + 2 * C);
    // each opponent: the believed share that folds, and equity / lead against the part that goes on
    const k = BUCKETS.map((b) => believedContinue(b, size, p.foldBelief, kind === 'raise'));
    const each = opps.map((_, i) => {
      const { total } = eqParts[i]!;
      let all = 0;
      let kept = 0;
      for (let g = 0; g < G; g++) {
        all += total[g]!;
        kept += k[g]! * total[g]!;
      }
      // a player who isn't there counts as one who folds
      const fold = 1 - pres[i]! * (all > 0 ? kept / all : 1);
      const eq = kept > 0 ? fromParts(eqParts[i]!, k) : new Float32Array(1326).fill(1);
      const ah = kept > 0 ? fromParts(nowParts[i]!, k) : new Float32Array(1326).fill(1);
      return { fold, eq, ah };
    });
    // everyone folds; else the hand must beat each one who goes on (one who folds is beaten)
    const fold = each.reduce((f, x) => f * x.fold, 1);
    const goOn = 1 - fold;
    const eq = new Float32Array(1326);
    const ah = new Float32Array(1326);
    for (let c = 0; c < 1326; c++) {
      let w = 1;
      let a = 1;
      for (const x of each) {
        w *= x.fold + (1 - x.fold) * x.eq[c]!;
        a *= x.fold + (1 - x.fold) * x.ah[c]!;
      }
      eq[c] = goOn > 1e-9 ? (w - fold) / goOn : 1;
      ah[c] = goOn > 1e-9 ? (a - fold) / goOn : 1;
    }
    const callers = goOn > 1e-9 ? each.reduce((n, x) => n + (1 - x.fold), 0) / goOn : 1;
    options.push(option);
    aggro.push({ option, fold, size, eq, ahead: ah, callers });
  };

  if (!facing) {
    options.push({ kind: 'check', amount: 0, allIn: false, label: 'Check' });
    const maxBet = Math.min(s.stack, s.oppStack);
    if (maxBet > 0) {
      for (const f of s.betSizes ?? withHabit(DEFAULT_BETS, usualBet)) addAggro('bet', f * P, maxBet, `Bet ${pctLabel(f)}`);
      if (maxBet <= MAX_JAM_POTS * P || s.allInAlways) addAggro('bet', maxBet, maxBet, 'All-in');
    }
  } else {
    options.push({ kind: 'fold', amount: 0, allIn: false, label: 'Fold' });
    const call = Math.min(C, s.stack);
    options.push({ kind: 'call', amount: call, allIn: call >= s.stack, label: call >= s.stack ? 'Call all-in' : 'Call' });
    const maxTo = Math.min(s.stack, C + s.oppStack);
    if (maxTo > C) {
      for (const m of s.raiseSizes ?? withHabit(DEFAULT_RAISES, p.raiseHabit)) addAggro('raise', m * C, maxTo, `Raise ${+m.toFixed(1)}x`);
      if (maxTo - C <= MAX_JAM_POTS * (P + 2 * C) || s.allInAlways) addAggro('raise', maxTo, maxTo, 'All-in');
    }
  }

  // ---- scores ----------------------------------------------------------------------------
  const c = C / P;
  // What the bettor is believed to put in later if called (the size read, beliefs.ts), as a strong
  // hand that waits counts it, in pots: little from a small bet (he gives up), much from a big one
  // (he keeps betting) - never more than he has; on the turn only part of a street (WAIT_LAST).
  const waiting = streetsLeft === 1 ? WAIT_LAST : streetsLeft;
  const hisLater = facing ? Math.min(BARRELS * waiting * laterBets(c), s.oppStack / P) : 0;
  // Respect for a big bet: from ¾ pot up, growing with the size up to 2.25 pots (a shove is not
  // 20x scarier), more on the turn and most on the river - big late bets are underbluffed, and
  // players know it (HHP: they overfold to them).
  const late = 1 + 0.5 * (board.length - 3);
  // A raise of one's own bet reads strong at any size (raises are underbluffed: HHP's check-raise
  // = two pair or better), even for players who ignore big bets - not for those who suspect them.
  const cRead = s.facingRaise ? c + RAISE_READ : c;
  const respect = s.facingRaise && p.respect >= 0 ? Math.max(p.respect, RAISE_RESPECT) : p.respect;
  const read = facing ? Math.min(4, Math.max(0.4, 1 + 2 * respect * late * Math.min(1.5, Math.max(0, cRead - 0.75)))) : 1;
  // past the comfortable amount, every further comfort-sized chunk weighs one more loss aversion
  const lambda = (chips: number) => p.lossAversion * (1 + Math.max(0, chips / bb / p.comfortBB - 1));
  // tough decisions loom when little is left behind: pressure = pot / stack behind after the action
  const pressure = (potAfter: number, behind: number) => (behind <= 0 ? 0 : Math.min(1, potAfter / behind));
  // the habit: doublings (or halvings) away from the usual size - a bet in pots, a raise as a
  // multiple of the bet faced; an all-in counts at its real size
  const habit = p.habit * (river ? p.habitRiver : 1);
  const offHabit = (o: Option) => {
    const usual = o.kind === 'bet' ? usualBet : p.raiseHabit;
    if (!(usual > 0)) return 0;
    const size = o.kind === 'bet' ? o.amount / P : o.amount / C;
    return size > 0 ? Math.abs(Math.log2(size / usual)) : 0;
  };

  const motivesOf = (combo: number, o: Option): Motives => {
    const e = equity[combo]!;
    const A = ahead[combo]!;
    const F = scary[combo]!;
    // the fear of being outdrawn belongs to hands that feel good: the stronger, the more to lose;
    // in position it is smaller (IP_FEAR)
    const fearNow = A ** 6 * F * (s.inPosition ? IP_FEAR : 1);
    // delayed gratification only pays if the hand stays good and the board stays safe
    const keep = 1 - F;
    const none: Motives = { gain: 0, loss: 0, fear: 0, trap: 0, tough: 0, embarrassment: 0, liking: 0 };
    switch (o.kind) {
      case 'fold':
        return none;
      case 'check': {
        const we = weigh(e, p.longShot);
        // checking to the one with the initiative: their bet is coming (q), so the free card is
        // less likely and the money keeps coming in (check-raise, check-call) - "check to the raiser"
        // a donk-leader expects the bet less (profile.expectsBet), so their strong hands lead
        const q = !s.inPosition && s.oppInitiative ? Math.min(s.oppBets ?? OPP_BETS, p.expectsBet ?? 1) : 0;
        // out of position a check also keeps this street's check-raise / check-call - worth less
        // when the bettor is expected to check (after a card that changed the nuts)
        const thisStreet = s.inPosition ? 0 : 0.5 * (s.oppInitiative ? q / OPP_BETS : 1);
        return {
          ...none,
          gain: we,
          fear: fearNow * (1 - q),
          trap: TRAP * A * (q + (1 - q) * keep) * (streetsLeft * (s.inPosition ? IP_TRAP : 1) + thisStreet),
          tough: s.inPosition ? 0 : 0.5 * mid(e) * pressure(2 * P, s.stack),
          embarrassment: river && !s.inPosition ? 0.2 * (1 - e) : 0,
        };
      }
      case 'call': {
        const eP = weigh(e, p.longShot) ** read;
        const cc = o.amount / P;
        // worse hands kept in for later streets. A hand that feels like the nuts waits for the
        // bettor's later bets as his size reads them - it lets a big bettor keep betting and raises
        // a small stab now - or, once he gives up, for its own: the usual half pot a street, as far
        // as the board stays safe (so on a dry board it waits even against a small bet). Other
        // hands count on the usual half pot a street.
        const nuts = A ** 6;
        const later = nuts * Math.max(hisLater, TRAP * waiting * keep) + (1 - nuts) * TRAP * streetsLeft;
        return {
          ...none,
          gain: eP * (1 + cc),
          loss: (1 - eP) * cc,
          fear: fearNow,
          // ...and the players behind kept in now (no card first)
          trap: A * keep * later * (s.inPosition ? IP_TRAP : 1) + TRAP_BEHIND * A ** 2 * (s.behind ?? 0),
          tough: streetsLeft > 0 ? mid(eP) * pressure(P + 2 * o.amount, s.stack - o.amount) : 0,
          liking: 0,
        };
      }
      case 'bet':
      case 'raise': {
        const a = aggro.find((x) => x.option === o)!;
        const ec = a.eq[combo]!;
        // raising into a bet that reads strong (respect): fewer folds expected, less equity felt
        const rd = o.kind === 'raise' ? read : 1;
        const wc = weigh(Number.isNaN(ec) ? 1 : ec, p.longShot) ** rd;
        const fold = a.fold / rd;
        const won = o.kind === 'bet' ? 1 : 1 + c; // what a fold wins
        const r = o.amount / P;
        return {
          ...none,
          gain: fold * won + (1 - fold) * wc * (1 + r * a.callers),
          loss: (1 - fold) * (1 - wc) * r,
          fear: (fearNow * (1 - fold)) / (1 + a.size),
          trap: TRAP * (Number.isNaN(a.ahead[combo]!) ? 0 : a.ahead[combo]!) * keep * (1 - fold) * streetsLeft,
          // betting or raising a medium hand invites a raise or re-raise: the tough spot is right there
          tough: o.allIn ? 0 : 0.7 * mid(wc) * (1 - fold),
          // a bluff that gets called (shown on the river, caught earlier) is embarrassing
          embarrassment:
            0.5 *
            (river ? 1 : o.kind === 'raise' ? EMBARRASS_RAISE : streetsLeft === 2 ? EMBARRASS_BET.flop : EMBARRASS_BET.turn) *
            (1 + AUDIENCE * (pres.reduce((x, q) => x + q, 0) - 1)) *
            (1 - fold) *
            (1 - (Number.isNaN(ec) ? 1 : ec)) *
            (1 + r),
          liking: -offHabit(o),
        };
      }
    }
  };

  // His own move: the share of each combo that check-raises all-in out of habit (pairJam.ts), as
  // a liking for the all-in raise just big enough to give it that share (`jamLiking`, set below)
  const jam = options.findIndex((o) => o.kind === 'raise' && o.allIn);
  const jamShare = jam >= 0 ? pairJamShares(p.pairJam, s, classes, opps, scary) : null;
  const jamLiking = new Float32Array(jamShare ? 1326 : 0);

  const weighted = (o: Option, m: Motives, combo: number): Motives => ({
    gain: p.greed * m.gain,
    loss: -lambda(o.amount) * m.loss,
    fear: -p.fear * m.fear,
    trap: p.trap * m.trap,
    tough: -p.toughDecision * m.tough,
    embarrassment: -p.embarrassment * m.embarrassment,
    liking:
      o.kind === 'bet' || o.kind === 'raise'
        ? p.aggression + habit * m.liking + (o.kind === 'bet' && s.initiative ? (p.cbetHabit ?? 0) : 0) + (jamShare && o === options[jam] ? jamLiking[combo]! : 0)
        : o.kind === 'call'
          ? p.stickiness
          : 0,
  });
  const total = (w: Motives) => w.gain + w.loss + w.fear + w.trap + w.tough + w.embarrassment + w.liking;

  const probs = options.map(() => new Float32Array(1326).fill(NaN));
  const shares = new Array<number>(options.length).fill(0);
  const byBucket: Decision['byBucket'] = {};
  let rangeTotal = 0;
  const tau = Math.max(1e-3, p.noise);
  const scores = new Float64Array(options.length);
  for (let combo = 0; combo < 1326; combo++) {
    const w = mine[combo]!;
    const b = buckets[combo];
    if (!b || !(w > 0) || Number.isNaN(equity[combo]!)) continue;
    let top = -Infinity;
    options.forEach((o, i) => {
      scores[i] = total(weighted(o, motivesOf(combo, o), combo));
      top = Math.max(top, scores[i]!);
    });
    let sum = 0;
    for (let i = 0; i < options.length; i++) sum += Math.exp((scores[i]! - top) / tau);
    const h = jamShare?.[combo] ?? 0;
    if (h > 0) {
      // the liking that turns the jam's chance p into h + (1 - h) p, every other option's into (1 - h)
      // of its own: the habit takes a share of the hand, the motives decide the rest
      const lp = (scores[jam]! - top) / tau - Math.log(sum);
      const like = tau * (Math.log(h / (1 - h) + Math.exp(lp)) - lp);
      jamLiking[combo] = like;
      scores[jam]! += like;
      top = Math.max(top, scores[jam]!);
      sum = 0;
      for (let i = 0; i < options.length; i++) sum += Math.exp((scores[i]! - top) / tau);
    }
    const row = (byBucket[b] ??= { combos: 0, shares: new Array<number>(options.length).fill(0) });
    row.combos += w;
    rangeTotal += w;
    for (let i = 0; i < options.length; i++) {
      const pr = Math.exp((scores[i]! - top) / tau) / sum;
      probs[i]![combo] = pr;
      shares[i]! += w * pr;
      row.shares[i]! += w * pr;
    }
  }
  for (let i = 0; i < options.length; i++) shares[i]! /= rangeTotal || 1;
  for (const row of Object.values(byBucket)) for (let i = 0; i < options.length; i++) row!.shares[i]! /= row!.combos || 1;

  return {
    options,
    probs,
    shares,
    byBucket,
    facts: { equity, ahead, scary, bites },
    explain(combo) {
      return options.map((option) => {
        const motives = motivesOf(combo, option);
        const w = weighted(option, motives, combo);
        return { option, score: total(w), motives, weighted: w };
      });
    },
  };
}

const NAMED_SIZES: [number, string][] = [[1 / 3, '⅓ pot'], [0.5, '½ pot'], [2 / 3, '⅔ pot'], [0.75, '¾ pot'], [1, 'pot']];
/** "⅓ pot" for the usual sizes (within a percent of the pot), else "40% pot" or "2.5x pot". */
const pctLabel = (f: number) =>
  NAMED_SIZES.find(([v]) => Math.abs(f - v) < 0.01)?.[1] ?? (f > 1 ? `${+f.toFixed(2)}x pot` : `${Math.round(f * 100)}% pot`);

/** The range after an option: each combo's weight times how often it takes that option (narrowing). */
export function rangeAfter(d: Decision, optionIndex: number, mine: Weights): Weights {
  const out = new Float32Array(1326);
  const pr = d.probs[optionIndex]!;
  for (let c = 0; c < 1326; c++) {
    const v = pr[c]!;
    if (!Number.isNaN(v)) out[c] = mine[c]! * v;
  }
  return out;
}
