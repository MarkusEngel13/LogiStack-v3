import type { Card } from '../../core/cards';

/** What the board button deals next, by the number of board cards. */
export const nextBoardLabel = (count: number) =>
  count === 3 ? 'Random turn' : count === 4 ? 'Random river' : count === 5 ? 'New flop' : 'Random flop';

/**
 * The board after one press of the button: a flop on an empty board, then a turn, then a river;
 * on a full board a fresh flop. Never a card someone holds or the board already shows.
 */
export function dealNext(board: readonly Card[], held: readonly Card[], random: () => number = Math.random): Card[] {
  const keep = board.length === 3 || board.length === 4 ? [...board] : [];
  const used = new Set([...held, ...keep]);
  const deck = Array.from({ length: 52 }, (_, c) => c).filter((c) => !used.has(c));
  const size = keep.length === 0 ? 3 : keep.length + 1;
  while (keep.length < size && deck.length > 0) keep.push(deck.splice(Math.floor(random() * deck.length), 1)[0]!);
  return keep;
}
