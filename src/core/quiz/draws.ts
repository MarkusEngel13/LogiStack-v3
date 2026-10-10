/**
 * Draws and combos:
 *   1 Outs              - your hand, his hand, the flop: how many turn cards put you ahead?
 *   2 Draws on a board  - which draws can anyone hold on this flop?
 *   3 Combos            - how many combos of a hand are left, after the board and your cards?
 */

import { cardToString, parseCard, prettyCard, RANK_CHARS, rankOf, type Card } from '../cards';
import { evaluate } from '../evaluator';
import { classifyAll } from '../handClass';
import { cardsFromComboIndex } from '../cards';
import { between, newId, pick, shuffled, type Question, type Rand } from './types';

const deal = (rand: Rand, n: number, dead: readonly Card[] = []): Card[] => {
  const deck = shuffled(
    rand,
    Array.from({ length: 52 }, (_, c) => c).filter((c) => !dead.includes(c)),
  );
  return deck.slice(0, n);
};
const s = (cards: readonly Card[]) => cards.map(cardToString);
const pretty = (cards: readonly Card[]) => cards.map(prettyCard).join(' ');

/** Cards (from those not seen) that put `hero` strictly ahead of `villain` on the next street. */
export function outs(hero: readonly Card[], villain: readonly Card[], board: readonly Card[]): Card[] {
  const seen = new Set([...hero, ...villain, ...board]);
  const out: Card[] = [];
  for (let c = 0; c < 52; c++) {
    if (seen.has(c)) continue;
    if (evaluate([...hero, ...board, c]) > evaluate([...villain, ...board, c])) out.push(c);
  }
  return out;
}

function outsQuestion(level: number, rand: Rand): Question {
  // deal until you are behind on the flop with something to hope for (not a near-lock either way)
  for (let guard = 0; guard < 500; guard++) {
    const cards = deal(rand, 7);
    const hero = cards.slice(0, 2);
    const villain = cards.slice(2, 4);
    const board = cards.slice(4, 7);
    if (evaluate([...hero, ...board]) >= evaluate([...villain, ...board])) continue;
    const o = outs(hero, villain, board);
    if (o.length < 2 || o.length > 21) continue;
    const byRank = new Map<string, Card[]>();
    for (const c of o) {
      const r = RANK_CHARS[rankOf(c)]!;
      byRank.set(r, [...(byRank.get(r) ?? []), c]);
    }
    const list = [...byRank.values()].map((cs) => pretty(cs)).join(' · ');
    return {
      id: newId(rand),
      quiz: 'draws',
      level,
      type: 'outs',
      prompt: 'You are behind on the flop. How many turn cards put you ahead?',
      data: { hero: s(hero), villain: s(villain), board: s(board) },
      unit: 'outs',
      answer: { kind: 'number', value: o.length, tolerance: 0 },
      explain: `${o.length} outs: ${list}. Cards that help you but help him more don't count. Rule of 2 and 4: about ${o.length * 2} % for the turn, ${Math.min(100, o.length * 4)} % by the river.`,
    };
  }
  throw new Error('no outs spot found');
}

export const DRAW_KINDS = [
  { id: 'flush', label: 'Flush draw' },
  { id: 'open', label: 'Open-ended (or double gutshot)' },
  { id: 'gutshot', label: 'Gutshot' },
  { id: 'none', label: 'None of these' },
] as const;

/** Which draws someone can hold on a board (two hole cards; backdoors don't count). */
export function drawsOn(board: readonly Card[]): string[] {
  const classes = classifyAll(board);
  const found = new Set<string>();
  for (const h of classes) {
    if (!h) continue;
    if (h.flushDraw) found.add('flush');
    if (h.straightDraw === 'open') found.add('open');
    if (h.straightDraw === 'gutshot') found.add('gutshot');
  }
  return found.size ? DRAW_KINDS.map((d) => d.id).filter((id) => found.has(id)) : ['none'];
}

function drawsQuestion(level: number, rand: Rand): Question {
  const board = deal(rand, 3);
  const ids = drawsOn(board);
  const names = (xs: string[]) => xs.map((x) => DRAW_KINDS.find((d) => d.id === x)!.label.toLowerCase()).join(', ');
  return {
    id: newId(rand),
    quiz: 'draws',
    level,
    type: 'board-draws',
    prompt: 'Which draws can a player hold on this flop? (Tap all that apply. Backdoors don\'t count.)',
    data: { board: s(board) },
    choices: DRAW_KINDS.map((d) => ({ id: d.id, label: d.label })),
    answer: { kind: 'multi', ids },
    explain:
      ids[0] === 'none'
        ? 'No flush draw (no two cards of a suit) and no four-card straight draw: the board cards are too far apart for two hole cards to make four in a row of five.'
        : `On this flop: ${names(ids)}. A flush draw needs two cards of a suit on the board; a straight draw needs two board cards within five ranks of each other.`,
  };
}

/** Combos of a hand ("AK", "QQ") left when `dead` cards are out. */
export function combosLeft(hand: string, dead: readonly Card[]): number {
  const a = RANK_CHARS.indexOf(hand[0]!);
  const b = RANK_CHARS.indexOf(hand[1]!);
  const deadSet = new Set(dead);
  let n = 0;
  for (let i = 0; i < 1326; i++) {
    const [x, y] = cardsFromComboIndex(i);
    if (deadSet.has(x) || deadSet.has(y)) continue;
    const rx = rankOf(x);
    const ry = rankOf(y);
    if ((rx === a && ry === b) || (rx === b && ry === a)) n++;
  }
  return n;
}

function combosQuestion(level: number, rand: Rand): Question {
  const cards = deal(rand, 5);
  const hero = cards.slice(0, 2);
  const board = cards.slice(2, 5);
  const dead = [...hero, ...board];
  const boardRanks = [...new Set(board.map(rankOf))];
  const heroRanks = hero.map(rankOf);
  // ask about a hand your cards or the board block, so the blockers matter
  const ranks = [...new Set([...boardRanks, ...heroRanks])];
  const kind = pick(rand, ['set', 'two', 'unpaired']);
  let hand: string;
  let label: string;
  if (kind === 'set') {
    const r = pick(rand, boardRanks);
    hand = RANK_CHARS[r]! + RANK_CHARS[r]!;
    label = `a set of ${RANK_CHARS[r]}s (pocket ${hand})`;
  } else if (kind === 'two' && boardRanks.length >= 2) {
    const [r1, r2] = shuffled(rand, boardRanks).slice(0, 2) as [number, number];
    const [hi, lo] = r1 > r2 ? [r1, r2] : [r2, r1];
    hand = RANK_CHARS[hi]! + RANK_CHARS[lo]!;
    label = `${hand} (two pair)`;
  } else {
    const r1 = pick(rand, ranks);
    let r2 = between(rand, 0, 12);
    if (r2 === r1) r2 = (r2 + 1) % 13;
    const [hi, lo] = r1 > r2 ? [r1, r2] : [r2, r1];
    hand = RANK_CHARS[hi]! + RANK_CHARS[lo]!;
    label = hand;
  }
  const n = combosLeft(hand, dead);
  const pair = hand[0] === hand[1];
  const left = (r: string) => 4 - dead.filter((c) => RANK_CHARS[rankOf(c)] === r).length;
  const why = pair
    ? `${left(hand[0]!)} ${hand[0]}s left: ${left(hand[0]!)} × ${left(hand[0]!) - 1} ÷ 2 = ${n}`
    : `${left(hand[0]!)} ${hand[0]}s × ${left(hand[1]!)} ${hand[1]}s = ${n}`;
  return {
    id: newId(rand),
    quiz: 'draws',
    level,
    type: 'combos',
    prompt: `With your cards and this board, how many combos of ${label} are left?`,
    data: { hero: s(hero), board: s(board) },
    unit: 'combos',
    answer: { kind: 'number', value: n, tolerance: 0 },
    explain: `${why}. ${pair ? 'A pair has 6 combos with all four cards, 3 with three, 1 with two.' : 'Two different ranks have 16 combos with all cards live; every card you see takes some away.'}`,
  };
}

export function drawsQuestionFor(level: number, rand: Rand): Question {
  return level === 1 ? outsQuestion(level, rand) : level === 2 ? drawsQuestion(level, rand) : combosQuestion(level, rand);
}

export const cardsOf = (xs: readonly string[]) => xs.map(parseCard);
