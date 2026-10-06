/**
 * How a villain answers a bet: fold, call or raise, for every combo of their range.
 *
 * One rule for every board, size and street. Each option gets a score in pot units:
 *   fold  = 0
 *   call  = a mix of price thinking (what calling wins at this price: perceived equity x
 *           realisation x pot after the call, minus the call) and hand thinking (is my kind of
 *           hand good enough), + call incentive - fear + sunk cost + love of draws
 *   raise = the same value without the liking for calling and drawing, + aggression x (how strong
 *           the hand is - how big the bet is) + semi-bluffs
 * and the player picks by a soft choice: the better option more often, how strictly depends on
 * their noise. Personality lives in a handful of settings (VillainProfile); the S-curves over bet
 * sizes, the size sensitivity and the stack-depth effects all come out of the rule.
 *
 * The villain's equity is against the range they put Hero on (Hero's whole range; a big bet
 * read as strength is the bigBetRead setting, not a separate range per size).
 */

import type { Card } from '../cards';
import { classifyAll, MADE_CLASSES, type HandClass, type MadeClass } from '../handClass';
import type { Weights } from '../ranges/range';

export interface VillainProfile {
  name: string;
  /** Pots of extra liking for calling (GTO Wizard's "incentive"): stations +, nits -. */
  callIncentive: number;
  /** 0..1: 0 plays the price with the exact hand; 1 goes by hand class ("I have a pair, I call; nothing, I fold"). */
  handThinking: number;
  /** A call up to this many big blinds feels normal. */
  comfortBB: number;
  /** Pots of reluctance for each comfort amount beyond it (a 300 BB call is not "just 80 % pot"). */
  fear: number;
  /** Pots of extra willingness with the whole stack already in (scaled by the share invested). */
  sunkCost: number;
  /** Bets above 3/4 pot read as strength: + bluff-catchers feel weaker (respects), - stronger (suspicious). */
  bigBetRead: number;
  /** Raise willingness: 0 never, 1 normal, 2 maniac. Also drives semi-bluff raises with draws. */
  aggression: number;
  /** Pots of extra pull for draws (at a nut draw, with stacks deep enough to get paid). */
  drawLove: number;
  /** Pots: how loosely the better option wins. Small = consistent, large = erratic. */
  noise: number;
  /** God mode: pots added to the call or raise score of one hand class. */
  overrides?: Partial<Record<MadeClass, { call?: number; raise?: number }>>;
}

/** Starting points per player type (the wizard's types); to be calibrated against Marius's Excel. */
export const PRESETS: Record<string, VillainProfile> = {
  Reg: { name: 'Reg', callIncentive: 0, handThinking: 0.2, comfortBB: 150, fear: 0.3, sunkCost: 0.2, bigBetRead: 0.3, aggression: 1, drawLove: 0.1, noise: 0.08 },
  TAG: { name: 'TAG', callIncentive: -0.02, handThinking: 0.15, comfortBB: 150, fear: 0.35, sunkCost: 0.15, bigBetRead: 0.35, aggression: 1.2, drawLove: 0.08, noise: 0.06 },
  LAG: { name: 'LAG', callIncentive: 0.05, handThinking: 0.25, comfortBB: 200, fear: 0.2, sunkCost: 0.2, bigBetRead: 0.15, aggression: 1.5, drawLove: 0.2, noise: 0.1 },
  Nit: { name: 'Nit', callIncentive: -0.05, handThinking: 0.2, comfortBB: 60, fear: 0.6, sunkCost: 0.1, bigBetRead: 0.6, aggression: 0.6, drawLove: 0, noise: 0.06 },
  Fish: { name: 'Fish', callIncentive: 0.2, handThinking: 0.6, comfortBB: 120, fear: 0.25, sunkCost: 0.4, bigBetRead: 0, aggression: 0.4, drawLove: 0.35, noise: 0.2 },
  Whale: { name: 'Whale', callIncentive: 0.35, handThinking: 0.8, comfortBB: 400, fear: 0.1, sunkCost: 0.5, bigBetRead: -0.2, aggression: 0.35, drawLove: 0.5, noise: 0.25 },
  Maniac: { name: 'Maniac', callIncentive: 0.1, handThinking: 0.5, comfortBB: 400, fear: 0.05, sunkCost: 0.3, bigBetRead: -0.3, aggression: 2.2, drawLove: 0.4, noise: 0.25 },
};
PRESETS.Unknown = { ...PRESETS.Reg!, name: 'Unknown' };

/** A profile that just plays the price: calls exactly when calling is +EV, never raises. */
export const NEUTRAL: VillainProfile = {
  name: 'Neutral',
  callIncentive: 0,
  handThinking: 0,
  comfortBB: Infinity,
  fear: 0,
  sunkCost: 0,
  bigBetRead: 0,
  aggression: 0,
  drawLove: 0,
  noise: 0.001,
};

/** The wizard's statuses shift a profile. */
export function withStatuses(p: VillainProfile, tags: readonly string[] = []): VillainProfile {
  let q = { ...p };
  if (tags.includes('tilt')) {
    q = { ...q, callIncentive: q.callIncentive + 0.1, handThinking: Math.min(1, q.handThinking + 0.15), fear: q.fear * 0.7, aggression: q.aggression * 1.3, noise: q.noise + 0.05 };
  }
  if (tags.includes('drinking')) {
    q = { ...q, handThinking: Math.min(1, q.handThinking + 0.2), fear: q.fear * 0.5, aggression: q.aggression * 1.2, drawLove: q.drawLove + 0.05, noise: q.noise + 0.08 };
  }
  if (tags.includes('winning')) {
    q = { ...q, callIncentive: q.callIncentive + 0.05, fear: q.fear * 0.7 }; // playing with house money
  }
  return q;
}

/** The situation, in chips. Hero has bet; the villain has nothing in on this street yet. */
export interface Spot {
  /** Pot before Hero's bet. */
  pot: number;
  /** Hero's bet: what the villain must call (capped at the villain's stack). */
  bet: number;
  bb: number;
  /** Villain's chips behind before calling. */
  villainStack: number;
  /** Villain's chips already put in this hand (sunk cost). */
  villainInvested: number;
  /** Share of equity the villain expects to realise (position, skill); default 1. */
  realization?: number;
}

export interface Answer {
  fold: number;
  call: number;
  raise: number;
}

/** 0..1.2: how much a draw pulls, by what it draws to. */
export function drawStrength(h: HandClass): number {
  let d = 0;
  if (h.flushDraw) d = { nut: 1, second: 0.8, third: 0.7, low: 0.6 }[h.flushDraw];
  if (h.straightDraw) d = Math.max(d, (h.straightDraw === 'open' ? 0.8 : 0.4) * (h.straightDrawToNuts ? 1 : 0.75));
  if (h.flushDraw && h.straightDraw) d = Math.min(1.2, d + 0.3);
  return d;
}

export interface ComboFacts {
  /** Equity of this combo against the range the villain puts Hero on. */
  equity: number;
  /** Average equity of its hand class in the villain's range (what a class thinker feels). */
  classEquity: number;
  /** drawStrength() of the combo. */
  draw: number;
  made?: MadeClass;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Fold / call / raise probabilities of one combo. */
export function answer(p: VillainProfile, spot: Spot, facts: ComboFacts): Answer {
  const call = Math.min(spot.bet, spot.villainStack);
  if (call <= 0) return { fold: 0, call: 1, raise: 0 };
  const s = call / spot.pot;
  const k = clamp01(p.handThinking);
  // A big bet read as strength makes the hand feel weaker (stronger, for the suspicious). As a
  // power curve: bluff-catchers drop a lot, the nuts hardly (a set at 95 % stays near 90 %).
  const read = Math.min(4, Math.max(0.4, 1 + 2 * p.bigBetRead * Math.max(0, s - 0.75)));
  const e = clamp01(facts.equity) ** read;
  const eClass = clamp01(facts.classEquity) ** read;
  const r = spot.realization ?? 1;
  // Price thinking: what calling wins, checked down from here. Hand thinking: "is my kind of hand
  // good enough?" - pairs and better feel callable, air doesn't, the size matters only a little.
  const priceValue = r * e * (1 + 2 * s) - s;
  const handValue = 2 * (eClass - 0.4) - 0.25 * s;
  const felt = (1 - k) * e + k * eClass;

  const callBB = call / spot.bb;
  const fear = p.fear * Math.max(0, callBB / p.comfortBB - 1);
  const sunk = p.sunkCost * (spot.villainInvested / Math.max(1, spot.villainInvested + spot.villainStack));
  const behindAfter = spot.villainStack - call;
  const depth = Math.min(1, behindAfter / (spot.pot + 2 * call) / 2); // implied odds need chips behind
  const override = facts.made ? p.overrides?.[facts.made] : undefined;

  // What continuing is worth either way; the liking for calling and for drawing only lifts the
  // call (a station likes calling, not raising).
  const base = (1 - k) * priceValue + k * handValue - fear + sunk;
  const uCall = base + p.callIncentive + p.drawLove * facts.draw * depth + (override?.call ?? 0);
  const canRaise = behindAfter > 0;
  const uRaise = canRaise
    ? base + p.aggression * (2 * (felt - 0.7) - 0.6 * s) + p.aggression * 0.3 * facts.draw - (p.aggression > 0 ? 0 : 10) + (override?.raise ?? 0)
    : -Infinity;

  const tau = Math.max(1e-3, p.noise);
  const top = Math.max(0, uCall, uRaise);
  const f = Math.exp((0 - top) / tau);
  const c = Math.exp((uCall - top) / tau);
  const x = canRaise ? Math.exp((uRaise - top) / tau) : 0;
  const sum = f + c + x;
  return { fold: f / sum, call: c / sum, raise: x / sum };
}

export interface ClassAnswer extends Answer {
  combos: number;
}

export interface RangeAnswer extends Answer {
  /** Per combo (index = combo); NaN where the combo isn't in the range. */
  perCombo: { fold: Float32Array; call: Float32Array; raise: Float32Array };
  byClass: Record<MadeClass, ClassAnswer>;
}

/**
 * The whole range's answer: shares of fold / call / raise by combo weight, per combo and per
 * hand class. `equity` = each villain combo's equity against Hero's range (rangeVsRange's
 * second player `vsField`); combos without one are left out.
 */
export function rangeAnswer(p: VillainProfile, spot: Spot, range: Weights, equity: Float32Array, board: readonly Card[]): RangeAnswer {
  const classes = classifyAll(board);
  // class averages of equity, by weight, for the hand thinkers
  const sum = new Map<MadeClass, { w: number; e: number }>();
  classes.forEach((h, c) => {
    const w = range[c]!;
    const e = equity[c]!;
    if (!h || !(w > 0) || Number.isNaN(e)) return;
    const acc = sum.get(h.made) ?? { w: 0, e: 0 };
    acc.w += w;
    acc.e += w * e;
    sum.set(h.made, acc);
  });

  const perCombo = { fold: new Float32Array(1326).fill(NaN), call: new Float32Array(1326).fill(NaN), raise: new Float32Array(1326).fill(NaN) };
  const byClass = Object.fromEntries(MADE_CLASSES.map((k) => [k, { combos: 0, fold: 0, call: 0, raise: 0 }])) as Record<MadeClass, ClassAnswer>;
  let total = 0;
  const all = { fold: 0, call: 0, raise: 0 };
  classes.forEach((h, c) => {
    const w = range[c]!;
    const e = equity[c]!;
    if (!h || !(w > 0) || Number.isNaN(e)) return;
    const cls = sum.get(h.made)!;
    const a = answer(p, spot, { equity: e, classEquity: cls.e / cls.w, draw: drawStrength(h), made: h.made });
    perCombo.fold[c] = a.fold;
    perCombo.call[c] = a.call;
    perCombo.raise[c] = a.raise;
    const row = byClass[h.made];
    row.combos += w;
    row.fold += w * a.fold;
    row.call += w * a.call;
    row.raise += w * a.raise;
    all.fold += w * a.fold;
    all.call += w * a.call;
    all.raise += w * a.raise;
    total += w;
  });
  for (const k of MADE_CLASSES) {
    const row = byClass[k];
    if (row.combos > 0) {
      row.fold /= row.combos;
      row.call /= row.combos;
      row.raise /= row.combos;
    }
  }
  return {
    fold: total > 0 ? all.fold / total : NaN,
    call: total > 0 ? all.call / total : NaN,
    raise: total > 0 ? all.raise / total : NaN,
    perCombo,
    byClass,
  };
}
