/**
 * Card52: every card is an integer 0..51, carried over from v2.
 *
 *   card = suit * 13 + rank
 *   rank: 0 = 2, 1 = 3, ... 8 = T, 9 = J, 10 = Q, 11 = K, 12 = A
 *   suit: 0 = s, 1 = h, 2 = d, 3 = c
 *
 * Strings ("As", "Td") exist only at the edges: the stored hand record and the UI.
 */

export type Card = number;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'shdc';
const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];

export const rankOf = (card: Card): number => card % 13;
export const suitOf = (card: Card): number => Math.floor(card / 13);

export function parseCard(text: string): Card {
  const s = text.trim();
  if (s.length !== 2) throw new Error(`Invalid card "${text}"`);
  const rank = RANK_CHARS.indexOf(s[0]!.toUpperCase());
  const suit = SUIT_CHARS.indexOf(s[1]!.toLowerCase());
  if (rank < 0 || suit < 0) throw new Error(`Invalid card "${text}"`);
  return suit * 13 + rank;
}

export const parseCards = (texts: readonly string[]): Card[] => texts.map(parseCard);

export function cardToString(card: Card): string {
  if (!Number.isInteger(card) || card < 0 || card > 51) return '??';
  return RANK_CHARS[rankOf(card)]! + SUIT_CHARS[suitOf(card)]!;
}

/** "A♠" style, for display. */
export function prettyCard(card: Card): string {
  if (!Number.isInteger(card) || card < 0 || card > 51) return '??';
  return RANK_CHARS[rankOf(card)]! + SUIT_SYMBOLS[suitOf(card)]!;
}

/**
 * Canonical combo index 0..1325 for an unordered pair of distinct cards.
 * Same triangular formula as v2, so v2 range data stays compatible.
 */
export function comboIndex(a: Card, b: Card): number {
  if (a === b) return -1;
  const hi = a > b ? a : b;
  const lo = a > b ? b : a;
  return (hi * (hi - 1)) / 2 + lo;
}

export function cardsFromComboIndex(index: number): [Card, Card] {
  if (index < 0 || index >= 1326) return [-1, -1];
  const hi = Math.floor((1 + Math.sqrt(8 * index + 1)) / 2);
  const lo = index - (hi * (hi - 1)) / 2;
  return [hi, lo];
}
