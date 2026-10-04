/**
 * Showdown evaluator: best 5-card hand out of 5..7 cards.
 *
 * Returns a score where higher beats lower and equal scores tie:
 *   score = category << 20 | r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5
 * where r1..r5 are the ranks (0 = deuce .. 12 = ace) that decide ties for that category.
 */

import { type Card, rankOf, suitOf } from './cards';

export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

const CATEGORY_NAMES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const RANK_PLURALS = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

function pack(category: HandCategory, ranks: number[]): number {
  let score = category << 20;
  for (let i = 0; i < 5; i++) score |= (ranks[i] ?? 0) << (16 - 4 * i);
  return score;
}

/** High rank of the best straight in a 13-bit rank mask, or -1. The ace also plays low (wheel). */
function straightHigh(mask: number): number {
  const m = (mask << 1) | ((mask >> 12) & 1); // bit 0 = ace-low, bit k = rank k-1
  for (let top = 13; top >= 4; top--) {
    const run = 0b11111 << (top - 4);
    if ((m & run) === run) return top - 1;
  }
  return -1;
}

/** Ranks present in a mask, highest first. */
function ranksDesc(mask: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

export function evaluate(cards: readonly Card[]): number {
  if (cards.length < 5 || cards.length > 7) throw new Error(`evaluate() needs 5-7 cards, got ${cards.length}`);

  const counts = new Array<number>(13).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  let rankMask = 0;

  for (const c of cards) {
    const r = rankOf(c);
    const s = suitOf(c);
    counts[r]!++;
    suitMask[s]! |= 1 << r;
    suitCount[s]!++;
    rankMask |= 1 << r;
  }

  const flushSuit = suitCount.findIndex((n) => n >= 5);
  if (flushSuit >= 0) {
    const sf = straightHigh(suitMask[flushSuit]!);
    if (sf >= 0) return pack(HandCategory.StraightFlush, [sf]);
  }

  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }
  const kickers = (exclude: number[], n: number) =>
    ranksDesc(rankMask).filter((r) => !exclude.includes(r)).slice(0, n);

  if (quads.length > 0) {
    const q = quads[0]!;
    return pack(HandCategory.Quads, [q, ...kickers([q], 1)]);
  }

  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const t = trips[0]!;
    const p = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    return pack(HandCategory.FullHouse, [t, p]);
  }

  if (flushSuit >= 0) {
    return pack(HandCategory.Flush, ranksDesc(suitMask[flushSuit]!).slice(0, 5));
  }

  const st = straightHigh(rankMask);
  if (st >= 0) return pack(HandCategory.Straight, [st]);

  if (trips.length > 0) {
    const t = trips[0]!;
    return pack(HandCategory.Trips, [t, ...kickers([t], 2)]);
  }

  if (pairs.length >= 2) {
    const [p1, p2] = [pairs[0]!, pairs[1]!];
    return pack(HandCategory.TwoPair, [p1, p2, ...kickers([p1, p2], 1)]);
  }

  if (pairs.length === 1) {
    const p = pairs[0]!;
    return pack(HandCategory.Pair, [p, ...kickers([p], 3)]);
  }

  return pack(HandCategory.HighCard, ranksDesc(rankMask).slice(0, 5));
}

export const categoryOf = (score: number): HandCategory => (score >> 20) as HandCategory;

const rankAt = (score: number, i: number) => (score >> (16 - 4 * i)) & 0xf;

/** Plain-English name of a hand, e.g. "Two Pair, Kings and Sevens". */
export function describeHand(score: number): string {
  const cat = categoryOf(score);
  const r1 = rankAt(score, 0);
  const r2 = rankAt(score, 1);
  switch (cat) {
    case HandCategory.HighCard:
      return `High Card, ${RANK_NAMES[r1]}`;
    case HandCategory.Pair:
      return `Pair of ${RANK_PLURALS[r1]}`;
    case HandCategory.TwoPair:
      return `Two Pair, ${RANK_PLURALS[r1]} and ${RANK_PLURALS[r2]}`;
    case HandCategory.Trips:
      return `Three of a Kind, ${RANK_PLURALS[r1]}`;
    case HandCategory.Straight:
      return `Straight, ${RANK_NAMES[r1]} high`;
    case HandCategory.Flush:
      return `Flush, ${RANK_NAMES[r1]} high`;
    case HandCategory.FullHouse:
      return `Full House, ${RANK_PLURALS[r1]} full of ${RANK_PLURALS[r2]}`;
    case HandCategory.Quads:
      return `Four of a Kind, ${RANK_PLURALS[r1]}`;
    case HandCategory.StraightFlush:
      return r1 === 12 ? 'Royal Flush' : `Straight Flush, ${RANK_NAMES[r1]} high`;
    default:
      return CATEGORY_NAMES[cat] ?? 'Unknown';
  }
}
