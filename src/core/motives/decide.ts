/**
 * The motive model: how a player acts, for every combo of their range, at one decision -
 * checked to or first to act (check / bet sizes) or facing a bet (fold / call / raise sizes).
 *
 * Every option gets a score in pots, made only of motives (profile.ts weighs them):
 *   greed          x what the option can win (the pot if they fold, the pot plus their call if called and ahead)
 *   loss aversion  x what it can lose (more for amounts past the player's comfort)
 *   fear           x the lead the next cards can take (scary cards; betting or raising "protects")
 *   trap           x the worse hands kept in for later streets (delayed gratification)
 *   tough decision x how likely the line leaves a medium hand in a hard spot (a jam ends it)
 *   embarrassment  x a bluff called and shown (river)
 *   + a liking for betting (aggression) or for calling (stickiness)
 * and the player picks by a soft choice (noise). The fold is the zero.
 *
 * What the player believes about the other side - who folds to which size - is beliefs.ts; the
 * cards are exact: equity against the other range, how far ahead the hand is now, its scary
 * cards (fear.ts), and the same against the part of the range that keeps going after a bet.
 */

import { bucketAll, type Bucket } from '../buckets';
import type { Card } from '../cards';
import { rangeEquity } from '../equity/field';
import { aheadNow, fearNumbers } from '../fear';
import type { Weights } from '../ranges/range';
import { believedContinue } from './beliefs';
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
  /** Bet sizes in pots when not facing a bet. Default ⅓, ½, ¾, pot, 1.5 pots (plus all-in). */
  betSizes?: number[];
  /** Raise-to sizes as multiples of the bet faced. Default 2.5x and 3.5x (plus all-in). */
  raiseSizes?: number[];
  /** All-in stays on the menu even when it is many pots (it was taken: the story needs it). */
  allInAlways?: boolean;
  /**
   * The other player bet or raised last (an earlier street, e.g. the preflop raiser) and acts
   * after: their bet is expected, so a check keeps the check-raise and rarely gives a free card.
   */
  oppInitiative?: boolean;
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
const BITE = 0.03;
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
const OPP_BETS = 0.6;
/**
 * What a flat call is worth per player still to act behind, in pots: they stay in now (no card
 * comes first), may call or raise into the strong hand, and pay later streets.
 */
const TRAP_BEHIND = 1;
export const DEFAULT_RAISES = [2.5, 3.5];

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

/** Per combo, the product of several per-combo arrays (NaN anywhere stays NaN). */
function product(arrays: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(1326).fill(1);
  for (const a of arrays) for (let c = 0; c < 1326; c++) out[c]! *= a[c]!;
  return out;
}

/**
 * `opp`: the other range, or (multiway) the ranges of everyone else still in. Against several the
 * hand has to beat them all: equity and lead are the products of the heads-up ones, a card is
 * scary if it hurts the hand against anyone, a bet wins the pot only if everyone folds and each
 * caller adds to it.
 */
export function decide(p: MotiveProfile, s: Situation, mine: Weights, opp: Weights | readonly Weights[]): Decision {
  const opps: readonly Weights[] = opp instanceof Float32Array ? [opp] : opp;
  const { board, pot: P, toCall: C, bb } = s;
  if (board.length < 3) throw new Error('The motive model starts on the flop');
  const streetsLeft = 5 - board.length;
  const river = streetsLeft === 0;
  const buckets = bucketAll(board);

  const equity = product(opps.map((o) => rangeEquity(mine, o, board)));
  // Felt fear: the share of next cards that would bite into the hand's lead at all (people count
  // the cards that "could" hurt, not how likely the opponent holds the hand), two cards to come
  // scare more than one. 0 on the river.
  let ahead: Float32Array;
  const scary = new Float32Array(1326);
  const bites = new Float32Array(1326);
  if (river) {
    ahead = product(opps.map((o) => aheadNow(mine, o, board)));
  } else {
    const frs = opps.map((o) => fearNumbers(mine, o, board));
    ahead = product(frs.map((f) => f.ahead));
    const cardsToCome = streetsLeft === 2 ? 1.5 : 1;
    for (let combo = 0; combo < 1326; combo++) {
      const A = ahead[combo]!;
      if (Number.isNaN(A) || A <= 0) continue;
      let n = 0;
      let seen = 0;
      for (const card of frs[0]!.nextCards) {
        // a card bites if it takes a real part of the lead against anyone
        let counted = false;
        let bit = false;
        for (const fr of frs) {
          const o = fr.outdrawn[combo * 52 + card]!;
          if (Number.isNaN(o)) continue;
          counted = true;
          if (o >= BITE * fr.ahead[combo]!) bit = true;
        }
        if (!counted) continue;
        seen++;
        if (bit) n++;
      }
      bites[combo] = seen > 0 ? n / seen : 0;
      scary[combo] = Math.min(1, bites[combo]! * cardsToCome);
    }
  }

  // ---- options ---------------------------------------------------------------------------
  const options: Option[] = [];
  const aggro: Aggro[] = [];
  const facing = C > 0;
  const oppTotals = opps.map((o) => sumWeights(o, buckets));

  const addAggro = (kind: 'bet' | 'raise', amount: number, maxAmount: number, label: string) => {
    const amt = Math.min(Math.round(amount), maxAmount);
    if (amt <= (kind === 'raise' ? C : 0) || options.some((o) => o.kind === kind && o.amount === amt)) return;
    const allIn = amt >= maxAmount;
    const option: Option = { kind, amount: amt, allIn, label: allIn ? 'All-in' : label };
    const size = kind === 'bet' ? amt / P : (amt - C) / (P + 2 * C);
    // each opponent: the believed share that folds, and equity / lead against the part that goes on
    const each = opps.map((o, i) => {
      const cont = new Float32Array(1326);
      let kept = 0;
      for (let c = 0; c < 1326; c++) {
        const b = buckets[c];
        if (!b || !(o[c]! > 0)) continue;
        cont[c] = o[c]! * believedContinue(b, size, p.foldBelief, kind === 'raise');
        kept += cont[c]!;
      }
      const fold = oppTotals[i]! > 0 ? 1 - kept / oppTotals[i]! : 0;
      const eq = kept > 0 ? rangeEquity(mine, cont, board) : new Float32Array(1326).fill(1);
      const ah = kept > 0 ? aheadNow(mine, cont, board) : new Float32Array(1326).fill(1);
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
      for (const f of s.betSizes ?? DEFAULT_BETS) addAggro('bet', f * P, maxBet, `Bet ${pctLabel(f)}`);
      if (maxBet <= MAX_JAM_POTS * P || s.allInAlways) addAggro('bet', maxBet, maxBet, 'All-in');
    }
  } else {
    options.push({ kind: 'fold', amount: 0, allIn: false, label: 'Fold' });
    const call = Math.min(C, s.stack);
    options.push({ kind: 'call', amount: call, allIn: call >= s.stack, label: call >= s.stack ? 'Call all-in' : 'Call' });
    const maxTo = Math.min(s.stack, C + s.oppStack);
    if (maxTo > C) {
      for (const m of s.raiseSizes ?? DEFAULT_RAISES) addAggro('raise', m * C, maxTo, `Raise ${+m.toFixed(1)}x`);
      if (maxTo - C <= MAX_JAM_POTS * (P + 2 * C) || s.allInAlways) addAggro('raise', maxTo, maxTo, 'All-in');
    }
  }

  // ---- scores ----------------------------------------------------------------------------
  const c = C / P;
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

  const motivesOf = (combo: number, o: Option): Motives => {
    const e = equity[combo]!;
    const A = ahead[combo]!;
    const F = scary[combo]!;
    // the fear of being outdrawn belongs to hands that feel good: the stronger, the more to lose
    const fearNow = A ** 6 * F;
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
        const q = !s.inPosition && s.oppInitiative ? OPP_BETS : 0;
        return {
          ...none,
          gain: we,
          fear: fearNow * (1 - q),
          trap: TRAP * A * (q + (1 - q) * keep) * (streetsLeft + (s.inPosition ? 0 : 0.5)),
          tough: s.inPosition ? 0 : 0.5 * mid(e) * pressure(2 * P, s.stack),
          embarrassment: river && !s.inPosition ? 0.2 * (1 - e) : 0,
        };
      }
      case 'call': {
        const eP = weigh(e, p.longShot) ** read;
        const cc = o.amount / P;
        return {
          ...none,
          gain: eP * (1 + cc),
          loss: (1 - eP) * cc,
          fear: fearNow,
          // worse hands kept in for later streets, and the players behind kept in now (no card first)
          trap: TRAP * A * keep * streetsLeft + TRAP_BEHIND * A ** 2 * (s.behind ?? 0),
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
            (1 + AUDIENCE * (opps.length - 1)) *
            (1 - fold) *
            (1 - (Number.isNaN(ec) ? 1 : ec)) *
            (1 + r),
          liking: 0,
        };
      }
    }
  };

  const weighted = (o: Option, m: Motives): Motives => ({
    gain: p.greed * m.gain,
    loss: -lambda(o.amount) * m.loss,
    fear: -p.fear * m.fear,
    trap: p.trap * m.trap,
    tough: -p.toughDecision * m.tough,
    embarrassment: -p.embarrassment * m.embarrassment,
    liking: o.kind === 'bet' || o.kind === 'raise' ? p.aggression : o.kind === 'call' ? p.stickiness : 0,
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
      scores[i] = total(weighted(o, motivesOf(combo, o)));
      top = Math.max(top, scores[i]!);
    });
    let sum = 0;
    for (let i = 0; i < options.length; i++) sum += Math.exp((scores[i]! - top) / tau);
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
        const w = weighted(option, motives);
        return { option, score: total(w), motives, weighted: w };
      });
    },
  };
}

function sumWeights(w: Weights, buckets: (Bucket | null)[]): number {
  let t = 0;
  for (let c = 0; c < 1326; c++) if (buckets[c] && w[c]! > 0) t += w[c]!;
  return t;
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
