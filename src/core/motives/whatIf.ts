/**
 * "What happens if": for the player to act, each line - check, bet small, bet big, overbet (or
 * call and raise when facing a bet) - and what reaches the next street: how the other player
 * answers now, the part of their range that goes on (calls or checks behind), and that range on
 * every possible next card, with a blank and a scare card picked out. HHP: a small bet keeps
 * their weak hands in, a big one leaves only the strong ones - and a scare card changes who is
 * ahead.
 */

import { BUCKETS, bucketAll, type Bucket } from '../buckets';
import { cardsFromComboIndex, type Card } from '../cards';
import { equityVsRange } from '../equity/equity';
import type { Weights } from '../ranges/range';
import { decide, type OptionKind } from './decide';
import { theirAnswer, type SizeQuestion } from './sizes';

/** The bet sizes shown: small, big, overbet (pots). Raises when facing a bet: the defaults. */
const LINE_BETS = [1 / 3, 0.75, 1.5];

export interface WhatIfLine {
  label: string;
  kind: OptionKind;
  amount: number;
  /** How the other player answers now; null when the line just ends the street (a call, a check behind). */
  answer: { fold: number; passive: number; aggressive: number; passiveLabel: string; aggressiveLabel: string } | null;
  /** The other range that reaches the next street, and the pot there. */
  next: Weights;
  pot: number;
  /** The actor's equity against `next` on this street (known cards only). */
  equityNow?: number;
  /** Share of `next` that can play for stacks, on this street. */
  stacksNow: number;
  /** Per next card (index = card; null = can't come): the actor's equity and `next` by bucket share. */
  cards: ({ equity?: number; buckets: Partial<Record<Bucket, number>> } | null)[];
}

export interface WhatIfAnswer {
  street: 'turn' | 'river';
  lines: WhatIfLine[];
  /** The card that changes least and the one that hurts the actor most (or helps the other range most). */
  blank: number;
  scare: number;
}

/** A range by bucket share on a board, without combos that use a dead card. */
function shares(next: Weights, buckets: (Bucket | null)[], dead: readonly Card[]): Partial<Record<Bucket, number>> {
  const deadSet = new Set(dead);
  const acc: Partial<Record<Bucket, number>> = {};
  let total = 0;
  for (let c = 0; c < 1326; c++) {
    const w = next[c]!;
    const b = buckets[c];
    if (!(w > 0) || !b) continue;
    if (deadSet.size && blocked(c, deadSet)) continue;
    acc[b] = (acc[b] ?? 0) + w;
    total += w;
  }
  if (total > 0) for (const b of BUCKETS) if (acc[b]) acc[b] = acc[b]! / total;
  return acc;
}

function blocked(combo: number, dead: Set<Card>): boolean {
  const [a, b] = cardsFromComboIndex(combo);
  return dead.has(a) || dead.has(b);
}

export function whatIf(q: SizeQuestion): WhatIfAnswer {
  const s = q.situation;
  const { board, pot: P } = s;
  if (board.length !== 3 && board.length !== 4) throw new Error('What happens if: on the flop or the turn');
  const C = s.toCall;
  const facing = C > 0;
  const hero = q.actor.cards;
  const mine = decide(q.actor.profile, { ...s, betSizes: LINE_BETS }, q.actor.range, q.other.seen ?? q.other.range);

  const lines: Omit<WhatIfLine, 'cards' | 'equityNow' | 'stacksNow'>[] = [];
  mine.options.forEach((o, i) => {
    if (o.kind === 'fold' || o.allIn) return;
    if (o.kind === 'call' || (o.kind === 'check' && s.inPosition)) {
      // the street ends here: their range goes on as it is
      lines.push({ label: o.kind === 'call' ? 'Call' : 'Check behind', kind: o.kind, amount: o.amount, answer: null, next: q.other.range, pot: facing ? P + 2 * C : P });
      return;
    }
    const t = theirAnswer(q, mine, i);
    const checked = o.kind === 'check';
    lines.push({
      label: o.label,
      kind: o.kind,
      amount: o.amount,
      answer: {
        fold: t.fold,
        passive: t.passive,
        aggressive: t.aggressive,
        passiveLabel: checked ? 'check behind' : 'call',
        aggressiveLabel: checked ? 'bet' : 'raise',
      },
      next: t.passiveW,
      pot: checked ? P : P + 2 * o.amount,
    });
  });

  const nowBuckets = bucketAll(board);
  const dead = hero ?? [];
  const full: WhatIfLine[] = lines.map((l) => ({
    ...l,
    equityNow: hero ? equityVsRange(hero, board, l.next).equity : undefined,
    stacksNow: shares(l.next, nowBuckets, dead).cpfs ?? 0,
    cards: new Array(52).fill(null),
  }));

  const taken = new Set([...board, ...dead]);
  let blank = -1;
  let scare = -1;
  let least = Infinity;
  let worst = -Infinity;
  for (let card = 0; card < 52; card++) {
    if (taken.has(card)) continue;
    const nb = [...board, card];
    const buckets = bucketAll(nb);
    let change = 0;
    let harm = 0;
    for (const l of full) {
      const sh = shares(l.next, buckets, [...dead, card]);
      const equity = hero ? equityVsRange(hero, nb, l.next).equity : undefined;
      l.cards[card] = { equity, buckets: sh };
      const dStacks = (sh.cpfs ?? 0) - l.stacksNow;
      const dEq = equity !== undefined && l.equityNow !== undefined && !Number.isNaN(equity) ? equity - l.equityNow : 0;
      change += Math.abs(dStacks) + Math.abs(dEq);
      harm += dStacks - dEq;
    }
    if (change < least) {
      least = change;
      blank = card;
    }
    if (harm > worst) {
      worst = harm;
      scare = card;
    }
  }
  return { street: board.length === 3 ? 'turn' : 'river', lines: full, blank, scare };
}
