/**
 * Fast 5-7 card evaluator on bit masks, for equity loops (tens of millions of hands per second).
 *
 * Gives exactly the scores of the readable evaluator (category << 20 | ranks, see evaluator.ts);
 * the tests hold the two equal. A hand is two integers of 26 bits:
 *
 *   lo = spades | hearts << 13      hi = diamonds | clubs << 13      (bit r = rank r, 0 = deuce)
 *
 * so adding a card is `lo |= CARD_LO[c]; hi |= CARD_HI[c]`, and the cards must be distinct.
 * Only small 8192-entry tables, indexed by a 13-bit rank mask.
 */

import type { Card } from './cards';

const PAIR = 1 << 20;
const TWO_PAIR = 2 << 20;
const TRIPS = 3 << 20;
const STRAIGHT = 4 << 20;
const FLUSH = 5 << 20;
const FULL_HOUSE = 6 << 20;
const QUADS = 7 << 20;
const STRAIGHT_FLUSH = 8 << 20;

/** Number of ranks in a mask. */
const POP = new Uint8Array(8192);
/** High rank of the best straight in a mask (the ace also plays low), or -1. */
const STRAIGHT_HIGH = new Int8Array(8192);
/** The five highest ranks of a mask, packed r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5. */
const TOP5 = new Int32Array(8192);

for (let m = 1; m < 8192; m++) {
  POP[m] = POP[m >> 1]! + (m & 1);

  const wheel = (m << 1) | ((m >> 12) & 1); // bit 0 = ace low
  let high = -1;
  for (let top = 13; top >= 4 && high < 0; top--) {
    const run = 0b11111 << (top - 4);
    if ((wheel & run) === run) high = top - 1;
  }
  STRAIGHT_HIGH[m] = high;

  let packed = 0;
  let shift = 16;
  for (let r = 12; r >= 0 && shift >= 0; r--) {
    if (m & (1 << r)) {
      packed |= r << shift;
      shift -= 4;
    }
  }
  TOP5[m] = packed;
}
STRAIGHT_HIGH[0] = -1;

/** Per card, its bit in `lo` or `hi` (the other one is 0). */
export const CARD_LO = new Int32Array(52);
export const CARD_HI = new Int32Array(52);
for (let c = 0; c < 52; c++) {
  const suit = Math.floor(c / 13);
  const bit = 1 << (c % 13);
  if (suit < 2) CARD_LO[c] = bit << (13 * suit);
  else CARD_HI[c] = bit << (13 * (suit - 2));
}

const topRank = (mask: number) => 31 - Math.clz32(mask);

export function evalPacked(lo: number, hi: number): number {
  const s = lo & 0x1fff;
  const h = lo >>> 13;
  const d = hi & 0x1fff;
  const c = hi >>> 13;

  // With at most 7 cards a flush leaves too few cards for quads or a full house, so it can
  // be settled first.
  const flush = POP[s]! >= 5 ? s : POP[h]! >= 5 ? h : POP[d]! >= 5 ? d : POP[c]! >= 5 ? c : 0;
  if (flush) {
    const sf = STRAIGHT_HIGH[flush]!;
    return sf >= 0 ? STRAIGHT_FLUSH | (sf << 16) : FLUSH | TOP5[flush]!;
  }

  const ranks = s | h | d | c;
  const four = s & h & d & c;
  if (four) {
    const q = topRank(four);
    return QUADS | (q << 16) | ((TOP5[ranks ^ (1 << q)]! >> 4) & 0xf000);
  }

  const twoPlus = (s & h) | (s & d) | (s & c) | (h & d) | (h & c) | (d & c); // held at least twice
  const threePlus = ((s & h) | (d & c)) & ((s & d) | (h & c)); // at least three times
  if (threePlus) {
    const t = topRank(threePlus);
    const pair = twoPlus ^ (1 << t);
    if (pair) return FULL_HOUSE | (t << 16) | (topRank(pair) << 12);
  }

  const st = STRAIGHT_HIGH[ranks]!;
  if (st >= 0) return STRAIGHT | (st << 16);

  if (threePlus) {
    const t = topRank(threePlus);
    return TRIPS | (t << 16) | ((TOP5[ranks ^ (1 << t)]! >> 4) & 0xff00);
  }

  if (twoPlus) {
    const p1 = topRank(twoPlus);
    const rest = twoPlus ^ (1 << p1);
    if (rest) {
      const p2 = topRank(rest);
      return TWO_PAIR | (p1 << 16) | (p2 << 12) | ((TOP5[ranks ^ (1 << p1) ^ (1 << p2)]! >> 8) & 0xf00);
    }
    return PAIR | (p1 << 16) | ((TOP5[ranks ^ (1 << p1)]! >> 4) & 0xfff0);
  }

  return TOP5[ranks]!; // high card: category 0
}

/** Score of 5-7 distinct cards. */
export function evalCards(cards: readonly Card[]): number {
  let lo = 0;
  let hi = 0;
  for (const c of cards) {
    lo |= CARD_LO[c]!;
    hi |= CARD_HI[c]!;
  }
  return evalPacked(lo, hi);
}
