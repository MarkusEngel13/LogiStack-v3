/**
 * Board texture in the words HHP uses: wet / dynamic vs dry / static, paired, monotone, and
 * whether the last card changed the nuts (a "scare card": the flush or a straight got there, the
 * board paired). The motive model and the spot tags (what a moment of a hand is called) share it.
 */

import { rankOf, suitOf, type Card } from './cards';

export interface Texture {
  /** Most cards of one suit on the board. */
  maxSuit: number;
  monotone: boolean;
  /** Two of a suit on the flop / turn: a flush draw is possible. */
  flushDraw: boolean;
  /** Three or more of a suit: a flush is possible. */
  flushPossible: boolean;
  paired: boolean;
  /** Three board ranks within five (a straight is possible with two cards). */
  straightPossible: boolean;
  /** Two board ranks within four, not counting a straight already possible: open-enders and gutshots exist. */
  straightDraws: boolean;
  /** HHP's wet / dynamic board: draws everywhere (flush draw or straight chances). */
  wet: boolean;
  /** HHP's dry / static board: no flush draw, no connected cards - the best hand rarely changes. */
  static: boolean;
}

/** Distinct ranks, with the ace also low when `wheel` (for straights). */
function straightRanks(board: readonly Card[], wheel: boolean): number[] {
  const ranks = new Set(board.map(rankOf));
  const out = [...ranks].map((r) => r + 1); // 2 -> 1 ... A -> 13
  if (wheel && ranks.has(12)) out.push(0); // the wheel ace
  return out.sort((a, b) => a - b);
}

/**
 * Most distinct board ranks inside any five-rank window. The wheel counts for a straight that is
 * there, not for draws: A-7-2 is HHP's static board, its wheel gutshots don't make it wet.
 */
function inWindow(board: readonly Card[], wheel = true): number {
  const rs = straightRanks(board, wheel);
  let best = 0;
  for (const lo of rs) best = Math.max(best, rs.filter((r) => r >= lo && r <= lo + 4).length);
  return best;
}

export function texture(board: readonly Card[]): Texture {
  const suits = [0, 0, 0, 0];
  for (const c of board) suits[suitOf(c)]!++;
  const maxSuit = Math.max(...suits);
  const ranks = board.map(rankOf);
  const paired = new Set(ranks).size < ranks.length;
  const straightPossible = inWindow(board) >= 3;
  const w = inWindow(board, false);
  const straightDraws = !straightPossible && w >= 2 && board.length < 5;
  const flushDraw = maxSuit === 2 && board.length < 5;
  const flushPossible = maxSuit >= 3;
  const wet = flushDraw || flushPossible || straightPossible || straightDraws;
  return {
    maxSuit,
    monotone: board.length >= 3 && maxSuit === board.length,
    flushDraw,
    flushPossible,
    paired,
    straightPossible,
    straightDraws,
    wet,
    static: !flushDraw && !flushPossible && w <= 1,
  };
}

/** What the last card of the board did to the nuts (turn or river; null on the flop). */
export interface ScareCard {
  flush: boolean;
  straight: boolean;
  pair: boolean;
}

export function lastCardScare(board: readonly Card[]): ScareCard | null {
  if (board.length < 4) return null;
  const before = texture(board.slice(0, -1));
  const after = texture(board);
  const last = board[board.length - 1]!;
  return {
    flush: !before.flushPossible && after.flushPossible,
    straight: !before.straightPossible && after.straightPossible,
    pair: board.slice(0, -1).some((c) => rankOf(c) === rankOf(last)),
  };
}

/** The last card changed the nuts: a flush or a straight got there, or the board paired. */
export function nutsChanged(board: readonly Card[]): boolean {
  const s = lastCardScare(board);
  return !!s && (s.flush || s.straight || s.pair);
}
