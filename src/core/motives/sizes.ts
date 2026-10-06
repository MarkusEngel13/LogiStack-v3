/**
 * The size explorer: for the player to act, every bet or raise size against the other player's
 * range - how each bucket answers it (fold / call / raise: HHP's elastic or inelastic), what the
 * size says about the bettor's own range (the inverse question), and with known cards its EV.
 *
 * The EV is one street, like the Decision panel's call EV: a call is checked down from there, a
 * raise gets the better of fold or call. Both sides decide by the motive model; the other side
 * reads the bettor's range as the size shows it (soft size tell, story.ts).
 */

import { BUCKETS, type Bucket } from '../buckets';
import type { Card } from '../cards';
import { equityVsRange } from '../equity/equity';
import type { Weights } from '../ranges/range';
import { decide, type Decision, type OptionKind, type Situation } from './decide';
import type { MotiveProfile } from './profile';
import { keeper } from './story';

export interface SizeQuestion {
  /** The actor's situation, as in the story (pot before the bet faced, chips to call, stacks, ...). */
  situation: Situation;
  /** `seen` = the range as the other player sees it (story.ts); the range itself by default. */
  actor: { profile: MotiveProfile; range: Weights; seen?: Weights; cards?: Card[] };
  other: { profile: MotiveProfile; range: Weights; seen?: Weights };
}

export interface SizeRow {
  label: string;
  kind: OptionKind;
  /** Chips the actor puts in (the bet, or the raise including the call). */
  amount: number;
  allIn: boolean;
  /** How often the actor's range picks this size (the model's own sizing). */
  chosen: number;
  /** The other player's answer over their whole range. */
  fold: number;
  call: number;
  raise: number;
  /** Per bucket of the other range: combos, share that continues (calls or raises), share that raises. */
  byBucket: Partial<Record<Bucket, { combos: number; cont: number; raise: number }>>;
  /** The actor's range as this size shows it. */
  shows: Weights;
  /** Known cards only: equity against the calling range and the EV in chips (one street). */
  eqCall?: number;
  ev?: number;
}

export interface SizeAnswer {
  rows: SizeRow[];
  /** Check, or fold and call: the passive options, EV with known cards (checked down). */
  passive: { label: string; ev?: number }[];
  /** Known cards: equity against the other range. */
  equity?: number;
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

/** The other player's answer to one of the actor's options. */
export interface TheirAnswer {
  /** The actor's range as the option shows it, and as the other player reads it. */
  shows: Weights;
  theySee: Weights;
  /** Their whole range: fold, call (or check behind), raise (or bet) - and the chips a raise adds. */
  fold: number;
  passive: number;
  aggressive: number;
  raiseChips: number;
  /** The parts of their range (weights) that call or check, and that raise or bet. */
  passiveW: Weights;
  aggressiveW: Weights;
  decision: Decision;
}

/** How the other player answers the actor's option `i` of `mine` (a bet, a raise, or a check). */
export function theirAnswer(q: SizeQuestion, mine: Decision, i: number): TheirAnswer {
  const s = q.situation;
  const { pot: P, board } = s;
  const C = s.toCall;
  const facing = C > 0;
  const o = mine.options[i]!;
  const actorSeen = q.actor.seen ?? q.actor.range;
  const reading = q.other.profile.rangeReading;
  const keep = keeper(mine, i);
  const shows = new Float32Array(1326);
  const theySee = new Float32Array(1326);
  for (let c = 0; c < 1326; c++) {
    const k = keep(c);
    if (Number.isNaN(k)) continue;
    if (q.actor.range[c]! > 0) shows[c] = q.actor.range[c]! * k;
    // the other side reads it as much as they read actions at all
    if (actorSeen[c]! > 0) theySee[c] = actorSeen[c]! * (1 - reading + reading * k);
  }
  // the other player now faces it (a check: they act behind, nothing to call)
  const A = o.kind === 'check' ? 0 : o.amount;
  const owed = facing ? A - C : A;
  const theirs: Situation = {
    board,
    pot: facing ? P + 2 * C : P,
    toCall: Math.max(0, Math.min(owed, s.oppStack)),
    stack: s.oppStack,
    oppStack: s.stack - A,
    bb: s.bb,
    inPosition: !s.inPosition,
    // the actor raises their bet: they face a raise
    facingRaise: facing && o.kind === 'raise',
  };
  const d = decide(q.other.profile, theirs, q.other.range, theySee);
  let fold = 0;
  let passive = 0;
  let aggressive = 0;
  let raiseChips = 0;
  const passiveW = new Float32Array(1326);
  const aggressiveW = new Float32Array(1326);
  d.options.forEach((x, j) => {
    const sh = d.shares[j]!;
    if (x.kind === 'fold') {
      fold += sh;
      return;
    }
    const isPassive = x.kind === 'call' || x.kind === 'check';
    if (isPassive) passive += sh;
    else {
      aggressive += sh;
      raiseChips += sh * x.amount;
    }
    const into = isPassive ? passiveW : aggressiveW;
    const pr = d.probs[j]!;
    for (let c = 0; c < 1326; c++) if (!Number.isNaN(pr[c]!)) into[c]! += q.other.range[c]! * pr[c]!;
  });
  return { shows, theySee, fold, passive, aggressive, raiseChips, passiveW, aggressiveW, decision: d };
}

export function exploreSizes(q: SizeQuestion): SizeAnswer {
  const s = q.situation;
  const { pot: P, board } = s;
  const C = s.toCall;
  const facing = C > 0;
  const mine = decide(q.actor.profile, { ...s, allInAlways: true }, q.actor.range, q.other.seen ?? q.other.range);
  const eq = q.actor.cards ? equityVsRange(q.actor.cards, board, q.other.range) : null;
  const equity = eq?.equity;

  const passive = facing
    ? [
        { label: 'Fold', ev: eq ? 0 : undefined },
        { label: 'Call', ev: eq ? eq.equity * (P + 2 * C) - C : undefined },
      ]
    : [{ label: 'Check', ev: eq ? eq.equity * P : undefined }];

  const rows: SizeRow[] = [];
  mine.options.forEach((o, i) => {
    if (o.kind !== 'bet' && o.kind !== 'raise') return;
    const A = o.amount;
    const t = theirAnswer(q, mine, i);
    const { shows, fold, raiseChips, decision: d } = t;
    const call = t.passive;
    const raise = t.aggressive;
    const callW = t.passiveW;
    const raiseW = t.aggressiveW;
    const byBucket: SizeRow['byBucket'] = {};
    for (const b of BUCKETS) {
      const row = d.byBucket[b];
      if (!row) continue;
      let f = 0;
      let r = 0;
      d.options.forEach((x, j) => {
        if (x.kind === 'fold') f += row.shares[j]!;
        if (x.kind === 'raise') r += row.shares[j]!;
      });
      byBucket[b] = { combos: row.combos, cont: 1 - f, raise: r };
    }

    const out: SizeRow = { label: o.label, kind: o.kind, amount: A, allIn: o.allIn, chosen: mine.shares[i]!, fold, call, raise, byBucket, shows };
    if (eq) {
      const eqC = mean(eq.vsCombo, callW);
      const eqR = mean(eq.vsCombo, raiseW);
      // their raise, in chips they add on top of what they had in (a typical size)
      const R = raise > 0 ? raiseChips / raise : 0;
      const ifCalled = Number.isNaN(eqC) ? 0 : eqC * (P + 2 * A) - A;
      let ifRaised = -A;
      if (raise > 0 && !Number.isNaN(eqR)) {
        const theirTotal = (facing ? C : 0) + R;
        ifRaised = Math.max(-A, eqR * (P + 2 * theirTotal) - theirTotal);
      }
      out.eqCall = eqC;
      out.ev = fold * (facing ? P + C : P) + call * ifCalled + raise * ifRaised;
    }
    rows.push(out);
  });
  return { rows, passive, equity };
}
