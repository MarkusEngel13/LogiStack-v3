/**
 * Fear numbers: how fragile a hand's lead is to the next card (HHP: "scared of bad turn cards").
 *
 * For every combo of player A against player B's range, on a flop or a turn:
 * - `ahead`: the share of B's range A beats right now, ties half (the hands as they stand, no
 *   cards to come);
 * - `outdrawn`, per next card: the share of B's range A beats now but loses to (or ties) once that
 *   card comes - what the card takes away from A's lead;
 * - `fear`: the average over the next cards of outdrawn / ahead, the part of the lead one card
 *   takes away. 0 = nothing can hurt the hand (a set on A-7-2 rainbow, nearly), large = many cards
 *   hurt it (a set on J-9-2 with two spades). Nothing to lose (ahead = 0) is fear 0.
 *
 * Card removal is exact: B's combos that share a card with A, or hold the next card, drop out.
 * This is the plain fact of the cards; how afraid a given player *feels* is the motive model's job.
 */

import type { Card } from './cards';
import { liveCombos, packed, checkBoard } from './equity/equity';
import { CARD_HI, CARD_LO, evalPacked } from './fastEval';
import type { Weights } from './ranges/range';

export interface FearResult {
  /** The cards that can come next (not on the board). */
  nextCards: Card[];
  /** Per combo of A (index = combo): share of B's range it beats now. NaN if not in A's range. */
  ahead: Float32Array;
  /** Per combo of A: the average part of its lead one card takes away, 0..1. NaN if not in A's range. */
  fear: Float32Array;
  /** Per combo of A: the share of next cards that take a tenth of its lead or more ("scary cards"). */
  scary: Float32Array;
  /** Per combo of A and next card, at combo * 52 + card: share of B's range that overtakes it. NaN where the card can't come. */
  outdrawn: Float32Array;
}

export function fearNumbers(a: Weights, b: Weights, board: readonly Card[]): FearResult {
  checkBoard(board);
  if (board.length !== 3 && board.length !== 4) throw new Error('Fear numbers need a flop or a turn: a card still to come');
  const [boardLo, boardHi] = packed(board);
  const listA = liveCombos(a, boardLo, boardHi);
  const listB = liveCombos(b, boardLo, boardHi);
  const nextCards: Card[] = [];
  for (let c = 0; c < 52; c++) if (!board.includes(c)) nextCards.push(c);

  const nA = listA.length;
  const nB = listB.length;
  const nowA = new Int32Array(nA);
  const nowB = new Int32Array(nB);
  listA.forEach((h, i) => (nowA[i] = evalPacked(h.lo | boardLo, h.hi | boardHi)));
  listB.forEach((v, j) => (nowB[j] = evalPacked(v.lo | boardLo, v.hi | boardHi)));

  // lead now, over B's combos that don't share a card with A's
  const ahead = new Float32Array(1326).fill(NaN);
  const lead = new Float64Array(nA);
  for (let i = 0; i < nA; i++) {
    const h = listA[i]!;
    let won = 0;
    let all = 0;
    for (let j = 0; j < nB; j++) {
      const v = listB[j]!;
      if ((h.lo & v.lo) | (h.hi & v.hi)) continue;
      all += v.weight;
      won += v.weight * (nowA[i]! > nowB[j]! ? 1 : nowA[i] === nowB[j] ? 0.5 : 0);
    }
    lead[i] = all > 0 ? won / all : NaN;
    ahead[h.combo] = lead[i]!;
  }

  const outdrawn = new Float32Array(1326 * 52).fill(NaN);
  const lostSum = new Float64Array(nA);
  const cardsSeen = new Int32Array(nA);
  const afterB = new Int32Array(nB);
  for (const c of nextCards) {
    const cLo = CARD_LO[c]!;
    const cHi = CARD_HI[c]!;
    for (let j = 0; j < nB; j++) {
      const v = listB[j]!;
      afterB[j] = (v.lo & cLo) | (v.hi & cHi) ? -1 : evalPacked(v.lo | boardLo | cLo, v.hi | boardHi | cHi);
    }
    for (let i = 0; i < nA; i++) {
      const h = listA[i]!;
      if ((h.lo & cLo) | (h.hi & cHi)) continue; // A holds this card
      const afterA = evalPacked(h.lo | boardLo | cLo, h.hi | boardHi | cHi);
      let lost = 0;
      let all = 0;
      for (let j = 0; j < nB; j++) {
        if (afterB[j]! < 0) continue;
        const v = listB[j]!;
        if ((h.lo & v.lo) | (h.hi & v.hi)) continue;
        all += v.weight;
        const before = nowA[i]! > nowB[j]! ? 1 : nowA[i] === nowB[j] ? 0.5 : 0;
        const after = afterA > afterB[j]! ? 1 : afterA === afterB[j] ? 0.5 : 0;
        if (after < before) lost += v.weight * (before - after);
      }
      if (all > 0) {
        const share = lost / all;
        outdrawn[h.combo * 52 + c] = share;
        lostSum[i]! += share;
        cardsSeen[i]!++;
      }
    }
  }

  const fear = new Float32Array(1326).fill(NaN);
  const scary = new Float32Array(1326).fill(NaN);
  for (let i = 0; i < nA; i++) {
    const l = lead[i]!;
    const combo = listA[i]!.combo;
    if (Number.isNaN(l) || cardsSeen[i] === 0) continue;
    fear[combo] = l > 0 ? Math.min(1, lostSum[i]! / cardsSeen[i]! / l) : 0;
    let n = 0;
    if (l > 0) for (const c of nextCards) if (outdrawn[combo * 52 + c]! >= SCARY * l) n++;
    scary[combo] = n / cardsSeen[i]!;
  }
  return { nextCards, ahead, fear, scary, outdrawn };
}

/** A card is scary when it takes this much of a hand's lead or more. */
export const SCARY = 0.1;

/**
 * Share of B's range each combo of A beats right now (ties half), on any board of 3-5 cards.
 * NaN for combos not in A's range or without any B combo left after card removal.
 */
export function aheadNow(a: Weights, b: Weights, board: readonly Card[]): Float32Array {
  checkBoard(board);
  if (board.length < 3) throw new Error('"Ahead now" needs a flop, turn or river');
  const [boardLo, boardHi] = packed(board);
  const listA = liveCombos(a, boardLo, boardHi);
  const listB = liveCombos(b, boardLo, boardHi);
  const scoreB = new Int32Array(listB.length);
  listB.forEach((v, j) => (scoreB[j] = evalPacked(v.lo | boardLo, v.hi | boardHi)));
  const out = new Float32Array(1326).fill(NaN);
  for (const h of listA) {
    const s = evalPacked(h.lo | boardLo, h.hi | boardHi);
    let won = 0;
    let all = 0;
    for (let j = 0; j < listB.length; j++) {
      const v = listB[j]!;
      if ((h.lo & v.lo) | (h.hi & v.hi)) continue;
      all += v.weight;
      won += v.weight * (s > scoreB[j]! ? 1 : s === scoreB[j] ? 0.5 : 0);
    }
    if (all > 0) out[h.combo] = won / all;
  }
  return out;
}

export interface GroupFear {
  /** Weighted combos. */
  combos: number;
  /** Average share of the opponent's range beaten now. */
  ahead: number;
  /** Part of the group's lead one next card takes away on average (lead-weighted). */
  fear: number;
  /** Per card (index = card): part of the group's lead that card takes away; NaN for cards that can't come. */
  byCard: Float32Array;
}

/**
 * Fear of a group of A's combos (a bucket, a hand class): lead-weighted, so hands that are far
 * ahead count most - they are the ones with something to be afraid for.
 */
export function groupFear(r: FearResult, weights: Weights, inGroup: (combo: number) => boolean): GroupFear {
  let combos = 0;
  let aheadSum = 0;
  let leadSum = 0;
  let fearSum = 0;
  const cardLost = new Float64Array(52);
  const cardLead = new Float64Array(52);
  for (let combo = 0; combo < 1326; combo++) {
    const w = weights[combo]!;
    const ah = r.ahead[combo]!;
    if (!(w > 0) || Number.isNaN(ah) || !inGroup(combo)) continue;
    combos += w;
    aheadSum += w * ah;
    leadSum += w * ah;
    fearSum += w * ah * r.fear[combo]!;
    for (const c of r.nextCards) {
      const o = r.outdrawn[combo * 52 + c]!;
      if (Number.isNaN(o)) continue;
      cardLost[c]! += w * o;
      cardLead[c]! += w * ah;
    }
  }
  const byCard = new Float32Array(52).fill(NaN);
  for (const c of r.nextCards) if (cardLead[c]! > 0) byCard[c] = cardLost[c]! / cardLead[c]!;
  return {
    combos,
    ahead: combos > 0 ? aheadSum / combos : NaN,
    fear: leadSum > 0 ? fearSum / leadSum : combos > 0 ? 0 : NaN,
    byCard,
  };
}
