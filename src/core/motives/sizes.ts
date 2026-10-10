/**
 * The size explorer: for the player to act, every option - check, or fold and call, and every bet
 * or raise size - against everyone still in: how each of them answers (fold / call / raise, bucket
 * by bucket: HHP's elastic or inelastic), what the size says about the actor's own range (the
 * inverse question), and with known cards the EV of each option.
 *
 * The EV is this street only, every option measured the same way: the chips won from here on, the
 * hand checked down once the street is over.
 * - A bet or raise: the others fold, call (checked down) or raise (the actor then folds or calls,
 *   whichever is better).
 * - A check: the players still to act check behind (checked down) or bet (the actor folds or
 *   calls). In position nobody is left to act: checked down.
 * - A call: checked down; players still to act behind answer the bet first.
 * No check-raises after a check, no later streets: trap value and implied odds don't show.
 *
 * Multiway, the players answer in turn, each against the actor and everyone else (as the motive
 * model reads a multiway pot, decide.ts): a player who answered before him counts as far as he
 * is still in - as often as he called, with the hands he called with. The first raise ends the
 * round: the actor against the raiser, whoever called before is dead money. Equity against one
 * player is exact, against several sampled (Monte Carlo).
 */

import { BUCKETS, type Bucket } from '../buckets';
import type { Card } from '../cards';
import { equityVsRange, monteCarloEquity, type EquityResult } from '../equity/equity';
import type { Weights } from '../ranges/range';
import { decide, type Decision, type OptionKind, type Situation } from './decide';
import type { MotiveProfile } from './profile';
import { fingerprint, keeper } from './story';

/** One of the other players still in. */
export interface SizeOther {
  seat: number;
  profile: MotiveProfile;
  /** Their range as the model has it. */
  range: Weights;
  /** Their range as the actor sees it (the actor's range reading). Default: `range`. */
  seen?: Weights;
  /** The actor's range as they see it. Default: the actor's range. */
  seesActor?: Weights;
  /** The other players' ranges as they see them, by seat. Default: those players' ranges. */
  seesOthers?: Record<number, Weights>;
  /** Chips they have in on this street. Default: the bet the actor faces (heads-up), else 0. */
  streetBet?: number;
  /** Chips behind. Default: the situation's `oppStack`. */
  stack?: number;
  /** They act last on this street. Default (heads-up): the opposite of the actor. */
  inPosition?: boolean;
  /** They act after the actor on this street, so a check gives them the choice. Default (heads-up): when the actor is out of position. */
  after?: boolean;
}

export interface SizeQuestion {
  /** The actor's situation, as in the story (pot before the bet faced, chips to call, stacks, ...). */
  situation: Situation;
  /** `streetBet` = chips the actor already has in on this street (a bet that got raised). */
  actor: { profile: MotiveProfile; range: Weights; cards?: Card[]; streetBet?: number };
  /** Everyone else still in, in the order they act after the actor. */
  others: SizeOther[];
}

/** How one player answers an option, over their whole range and by bucket. */
export interface PlayerAnswer {
  seat: number;
  /** Fold, call (or check behind), raise (or bet). */
  fold: number;
  call: number;
  raise: number;
  /** Per bucket of their range: combos, share that goes on (calls or raises), share that raises. */
  byBucket: Partial<Record<Bucket, { combos: number; cont: number; raise: number }>>;
}

export interface SizeRow {
  label: string;
  kind: OptionKind;
  /** Chips the actor puts in now (the call, the bet, or the raise including the call). */
  amount: number;
  allIn: boolean;
  /** How often the actor's range picks this option (the model's own choice). */
  chosen: number;
  /**
   * Over everyone who answers: everyone folds; nobody raises and someone calls; someone raises.
   * After a check: 0; everyone checks behind; someone bets. All 0 when nobody answers.
   */
  fold: number;
  call: number;
  raise: number;
  /** Each player who answers, in the order they act (none for a fold, a check behind, a call that ends the street). */
  players: PlayerAnswer[];
  /** The actor's range as this option shows it. */
  shows: Weights;
  /** Known cards only: equity when called without a raise (averaged over who calls), and the EV in chips (this street). */
  eqCall?: number;
  ev?: number;
}

export interface SizeAnswer {
  /** The bet or raise sizes. */
  rows: SizeRow[];
  /** Check, or fold and call. */
  passive: SizeRow[];
  /** Known cards: equity against everyone still in (checked down). */
  equity?: number;
  multiway: boolean;
}

/** Weighted mean of per-combo values over weights. */
function mean(values: Float32Array, weights: Float32Array): number {
  let w = 0;
  let s = 0;
  for (let c = 0; c < 1326; c++) {
    const v = values[c]!;
    if (weights[c]! > 0 && !Number.isNaN(v)) {
      w += weights[c]!;
      s += weights[c]! * v;
    }
  }
  return w > 0 ? s / w : NaN;
}

const total = (w: Weights) => {
  let t = 0;
  for (let c = 0; c < 1326; c++) if (w[c]! > 0) t += w[c]!;
  return t;
};

/** The other player's answer to one of the actor's options. */
export interface TheirAnswer {
  seat: number;
  /** Chips they owe after the actor's option (0 after a check). */
  owed: number;
  /** The actor's range as the option shows it, and as this player reads it. */
  shows: Weights;
  theySee: Weights;
  /** Their whole range: fold, call (or check behind), raise (or bet). */
  fold: number;
  passive: number;
  aggressive: number;
  /** The parts of their range (weights) that call or check, and that raise or bet. */
  passiveW: Weights;
  aggressiveW: Weights;
  /** Each raise (or bet) they can make: chips put in, share of the range, the hands that make it. */
  raises: { amount: number; share: number; w: Weights }[];
  decision: Decision;
}

/**
 * Who answers the actor's option `i`, and how: the players who owe chips after it (everyone after
 * a bet or raise, the players behind after a call) or, after a check, those still to act. `matched`
 * = the others still in who owe nothing (they stay in for the showdown).
 */
export function answersTo(q: SizeQuestion, mine: Decision, i: number): { answers: TheirAnswer[]; matched: SizeOther[] } {
  const s = q.situation;
  const o = mine.options[i]!;
  const heroIn = q.actor.streetBet ?? 0;
  const facing = s.toCall > 0;
  const heads = q.others.length === 1;
  const A = o.kind === 'check' || o.kind === 'fold' ? 0 : o.amount;
  // chips in the middle after the option
  const totalAfter = s.pot + s.toCall + A;
  const keep = keeper(mine, i);
  const shows = new Float32Array(1326);
  for (let c = 0; c < 1326; c++) {
    const k = keep(c);
    if (!Number.isNaN(k) && q.actor.range[c]! > 0) shows[c] = q.actor.range[c]! * k;
  }
  const streetBetOf = (x: SizeOther) => x.streetBet ?? (heads && facing ? heroIn + s.toCall : 0);
  const stackOf = (x: SizeOther) => x.stack ?? s.oppStack;
  const owedOf = (x: SizeOther) => Math.max(0, heroIn + A - streetBetOf(x));

  const responders =
    o.kind === 'fold'
      ? []
      : o.kind === 'check'
        ? q.others.filter((x) => (x.after ?? (heads && !s.inPosition)) && stackOf(x) > 0)
        : q.others.filter((x) => owedOf(x) > 0 && stackOf(x) > 0);
  const matched = o.kind === 'fold' ? [] : q.others.filter((x) => !responders.includes(x));

  // In turn: each one answers knowing what came before - a player who answered earlier is still
  // in as often as he called (after a check: always, everyone checked so far), with the hands he
  // called with; a raise or bet ends the round, so only the passive answers carry on.
  const answers: TheirAnswer[] = [];
  responders.forEach((x, k) => {
    const reading = x.profile.rangeReading;
    const read = (seen: Weights, kept: (c: number) => number) => {
      const w = new Float32Array(1326);
      // the other side reads it as much as they read actions at all
      for (let c = 0; c < 1326; c++) {
        const kk = kept(c);
        if (!Number.isNaN(kk) && seen[c]! > 0) w[c] = seen[c]! * (1 - reading + reading * kk);
      }
      return w;
    };
    const theySee = read(x.seesActor ?? q.actor.range, keep);
    const owed = owedOf(x);
    const stack = stackOf(x);
    const rest = q.others.filter((y) => y !== x);
    const earlier = answers.map((t) => {
      const y = q.others.find((z) => z.seat === t.seat)!;
      const goOn = 1 - t.aggressive;
      const stays = o.kind === 'check' ? 1 : goOn > 1e-9 ? t.passive / goOn : 0;
      const called = (c: number) => (y.range[c]! > 0 ? t.passiveW[c]! / y.range[c]! : NaN);
      return { seat: t.seat, w: read(x.seesOthers?.[y.seat] ?? y.range, called), stays, adds: stays * t.owed };
    });
    const later = rest.filter((y) => !earlier.some((e) => e.seat === y.seat));
    const theirs: Situation = {
      board: s.board,
      // the pot before the bet they face (decide.ts: a call wins pot + 2x the call), with the
      // calls expected before them
      pot: totalAfter + earlier.reduce((x, e) => x + e.adds, 0) - owed,
      toCall: Math.min(owed, stack),
      stack,
      oppStack: Math.max(s.stack - A, ...rest.map(stackOf)),
      bb: s.bb,
      inPosition: x.inPosition ?? !s.inPosition,
    };
    if (owed > 0) {
      // their own bet got raised (a check-raise, a re-raise)
      if (streetBetOf(x) > 0) theirs.facingRaise = true;
      const behind = responders.length - 1 - k;
      if (behind > 0) theirs.behind = behind;
    }
    const opps = [theySee, ...earlier.map((e) => e.w), ...later.map((y) => x.seesOthers?.[y.seat] ?? y.range)];
    const presence = [1, ...earlier.map((e) => e.stays), ...later.map(() => 1)];
    const d = opps.length === 1 ? decide(x.profile, theirs, x.range, opps[0]!) : decide(x.profile, theirs, x.range, opps, presence);
    let fold = 0;
    let passive = 0;
    let aggressive = 0;
    const passiveW = new Float32Array(1326);
    const aggressiveW = new Float32Array(1326);
    const raises: TheirAnswer['raises'] = [];
    d.options.forEach((opt, j) => {
      const sh = d.shares[j]!;
      if (opt.kind === 'fold') {
        fold += sh;
        return;
      }
      const isPassive = opt.kind === 'call' || opt.kind === 'check';
      const pr = d.probs[j]!;
      const w = new Float32Array(1326);
      for (let c = 0; c < 1326; c++) if (!Number.isNaN(pr[c]!)) w[c] = x.range[c]! * pr[c]!;
      const into = isPassive ? passiveW : aggressiveW;
      for (let c = 0; c < 1326; c++) into[c]! += w[c]!;
      if (isPassive) passive += sh;
      else {
        aggressive += sh;
        raises.push({ amount: opt.amount, share: sh, w });
      }
    });
    answers.push({ seat: x.seat, owed, shows, theySee, fold, passive, aggressive, passiveW, aggressiveW, raises, decision: d });
  });
  return { answers, matched };
}

/** How the other player answers the actor's option `i`, heads-up (the "what happens if" lines). */
export function theirAnswer(q: SizeQuestion, mine: Decision, i: number): TheirAnswer {
  const a = answersTo(q, mine, i).answers[0];
  if (!a) throw new Error('Nobody answers this option');
  return a;
}

function playerAnswer(t: TheirAnswer): PlayerAnswer {
  const d = t.decision;
  const byBucket: PlayerAnswer['byBucket'] = {};
  for (const b of BUCKETS) {
    const row = d.byBucket[b];
    if (!row) continue;
    let f = 0;
    let r = 0;
    d.options.forEach((x, j) => {
      if (x.kind === 'fold') f += row.shares[j]!;
      if (x.kind === 'raise' || x.kind === 'bet') r += row.shares[j]!;
    });
    byBucket[b] = { combos: row.combos, cont: 1 - f, raise: r };
  }
  return { seat: t.seat, fold: t.fold, call: t.passive, raise: t.aggressive, byBucket };
}

/** Outcomes less likely than this are left out of the EV (and the rest scaled up): big multiway pots stay fast. */
const MIN_OUTCOME = 0.002;
const MC_SAMPLES = 20_000;

/** The actor's equity against several ranges at once: exact against one (from the per-combo table), sampled against more. */
function equityMaker(cards: Card[], board: Card[], others: readonly SizeOther[]) {
  const exact = new Map<number, EquityResult>();
  const one = (seat: number) => {
    let r = exact.get(seat);
    if (!r) exact.set(seat, (r = equityVsRange(cards, board, others.find((x) => x.seat === seat)!.range)));
    return r;
  };
  const sampled = new Map<string, number>();
  return (parts: { seat: number; w: Weights }[]): number => {
    if (parts.length === 0) return 1;
    if (parts.some((p) => !(total(p.w) > 1e-9))) return NaN;
    if (parts.length === 1) return mean(one(parts[0]!.seat).vsCombo, parts[0]!.w);
    const key = parts.map((p) => `${p.seat}:${fingerprint(p.w)}`).join('|');
    let e = sampled.get(key);
    if (e === undefined) {
      try {
        e = monteCarloEquity(cards, board, parts.map((p) => p.w), { samples: MC_SAMPLES, seed: 1 }).equity;
      } catch {
        e = NaN; // the ranges block each other (no hands left)
      }
      sampled.set(key, e);
    }
    return e;
  };
}

/**
 * The EV of one option with known cards, this street: see the module comment. `pot0` = chips in
 * the middle now, `A` = chips the option puts in.
 */
function optionEV(
  q: SizeQuestion,
  kind: OptionKind,
  A: number,
  answers: TheirAnswer[],
  matched: SizeOther[],
  eqOf: ReturnType<typeof equityMaker>,
): { ev: number; eqCall?: number } {
  const s = q.situation;
  const pot0 = s.pot + s.toCall;
  const heroIn = q.actor.streetBet ?? 0;
  if (kind === 'fold') return { ev: 0 };

  if (kind === 'check') {
    // nobody bets: checked down against everyone (those who checked behind with their check range)
    let ev = 0;
    let noBet = 1;
    for (const t of answers) {
      if (t.aggressive > 0) {
        // they are the first to bet: fold or call against what they bet with (the rest fold)
        const first = noBet * t.aggressive;
        for (const r of t.raises) {
          const B = r.amount;
          const eq = eqOf([{ seat: t.seat, w: r.w }]);
          const call = Number.isNaN(eq) ? 0 : eq * (pot0 + 2 * Math.min(B, s.stack)) - Math.min(B, s.stack);
          ev += first * (r.share / t.aggressive) * Math.max(0, call);
        }
      }
      noBet *= 1 - t.aggressive;
    }
    if (noBet > 1e-9) {
      const parts = [...matched.map((x) => ({ seat: x.seat, w: x.range })), ...answers.map((t) => ({ seat: t.seat, w: t.passiveW }))];
      const eq = eqOf(parts);
      ev += noBet * (Number.isNaN(eq) ? 0 : eq * pot0);
    }
    return { ev };
  }

  // a call, bet or raise: the others fold, call or raise, each on his own; the first raise ends it
  let ev = 0;
  let noRaise = 1;
  let dead = 0; // expected calls before a raise: dead money once they fold to it
  for (const t of answers) {
    if (t.aggressive > 0) {
      const first = noRaise * t.aggressive;
      for (const r of t.raises) {
        const T = (t.owed > 0 ? heroIn + A - t.owed : 0) + r.amount; // their street total after raising
        const heroCall = Math.min(T - heroIn - A, s.stack - A);
        const theirIn = heroIn + A + heroCall - (T - r.amount); // chips of theirs that count (capped by the actor's stack)
        const final = pot0 + A + heroCall + theirIn + dead;
        const eq = eqOf([{ seat: t.seat, w: r.w }]);
        const call = Number.isNaN(eq) ? -Infinity : eq * final - (A + heroCall);
        ev += first * (r.share / t.aggressive) * Math.max(-A, call);
      }
    }
    const goOn = 1 - t.aggressive;
    if (goOn > 1e-9) dead += (t.passive / goOn) * t.owed;
    noRaise *= goOn;
  }

  if (noRaise > 1e-9) {
    // nobody raises: each one folds or calls (shares within no raise), every set of callers
    const n = answers.length;
    let sumP = 0;
    let sumEV = 0;
    let calledP = 0;
    let calledEq = 0;
    for (let mask = 0; mask < 1 << n; mask++) {
      let p = 1;
      const callers: TheirAnswer[] = [];
      answers.forEach((t, k) => {
        const goOn = 1 - t.aggressive;
        const pc = goOn > 1e-9 ? t.passive / goOn : 0;
        if (mask & (1 << k)) {
          p *= pc;
          callers.push(t);
        } else p *= 1 - pc;
      });
      if (p < MIN_OUTCOME) continue;
      const parts = [...matched.map((x) => ({ seat: x.seat, w: x.range })), ...callers.map((t) => ({ seat: t.seat, w: t.passiveW }))];
      let v: number;
      if (parts.length === 0) v = pot0; // everyone folds: the pot
      else {
        const eq = eqOf(parts);
        if (Number.isNaN(eq)) continue;
        v = eq * (pot0 + A + callers.reduce((x, t) => x + t.owed, 0)) - A;
        if (callers.length > 0) {
          calledP += p;
          calledEq += p * eq;
        }
      }
      sumP += p;
      sumEV += p * v;
    }
    if (sumP > 0) ev += noRaise * (sumEV / sumP);
    return { ev, eqCall: calledP > 0 ? calledEq / calledP : undefined };
  }
  return { ev };
}

/**
 * Options for re-asking a question with one read changed (stability.ts): `mine` = the actor's
 * decision, the same while what he believes stays; `only` = work out just these options (by
 * label), the others are left out of the answer.
 */
export interface ExploreOptions {
  mine?: Decision;
  only?: ReadonlySet<string>;
}

/** The actor's decision over his range: what a size says about him (exploreSizes' first step). */
export function actorDecision(q: SizeQuestion): Decision {
  const seen = q.others.map((x) => x.seen ?? x.range);
  return decide(q.actor.profile, { ...q.situation, allInAlways: true }, q.actor.range, seen.length === 1 ? seen[0]! : seen);
}

export function exploreSizes(q: SizeQuestion, opts: ExploreOptions = {}): SizeAnswer {
  const s = q.situation;
  const board = s.board;
  const mine = opts.mine ?? actorDecision(q);
  const cards = q.actor.cards;
  const eqOf = cards ? equityMaker(cards, board, q.others) : null;
  const equity = eqOf ? eqOf(q.others.map((x) => ({ seat: x.seat, w: x.range }))) : undefined;

  const row = (i: number): SizeRow => {
    const o = mine.options[i]!;
    const { answers, matched } = answersTo(q, mine, i);
    const shows = answers[0]?.shows ?? keepAll(q, mine, i);
    let fold = 0;
    let call = 0;
    let raise = 0;
    if (answers.length) {
      const allFold = o.kind === 'check' ? 0 : answers.reduce((x, t) => x * t.fold, 1);
      const noRaise = answers.reduce((x, t) => x * (1 - t.aggressive), 1);
      fold = allFold;
      raise = 1 - noRaise;
      call = Math.max(0, noRaise - allFold);
    }
    const out: SizeRow = {
      label: o.label,
      kind: o.kind,
      amount: o.amount,
      allIn: o.allIn,
      chosen: mine.shares[i]!,
      fold,
      call,
      raise,
      players: answers.map(playerAnswer),
      shows,
    };
    if (eqOf) {
      const A = o.kind === 'check' || o.kind === 'fold' ? 0 : o.amount;
      Object.assign(out, optionEV(q, o.kind, A, answers, matched, eqOf));
    }
    return out;
  };

  // the passive options (check, or fold and call), then each bet or raise size
  const rows: SizeRow[] = [];
  const passive: SizeRow[] = [];
  mine.options.forEach((o, i) => {
    if (opts.only && !opts.only.has(o.label)) return;
    (o.kind === 'bet' || o.kind === 'raise' ? rows : passive).push(row(i));
  });
  return { rows, passive, equity, multiway: q.others.length > 1 };
}

/** The actor's range as option `i` shows it (when nobody answers). */
function keepAll(q: SizeQuestion, mine: Decision, i: number): Weights {
  const keep = keeper(mine, i);
  const out = new Float32Array(1326);
  for (let c = 0; c < 1326; c++) {
    const k = keep(c);
    if (!Number.isNaN(k) && q.actor.range[c]! > 0) out[c] = q.actor.range[c]! * k;
  }
  return out;
}

/** A key for a question (ranges by fingerprint), for caches. */
export function sizeKey(q: SizeQuestion): string {
  const fp = (w?: Weights) => (w ? fingerprint(w) : null);
  return JSON.stringify([
    q.situation,
    q.actor.profile,
    fp(q.actor.range),
    q.actor.cards,
    q.actor.streetBet,
    q.others.map((x) => [
      x.seat,
      x.profile,
      fp(x.range),
      fp(x.seen),
      fp(x.seesActor),
      x.seesOthers && Object.entries(x.seesOthers).map(([k, w]) => [k, fp(w)]),
      x.streetBet,
      x.stack,
      x.inPosition,
      x.after,
    ]),
  ]);
}
