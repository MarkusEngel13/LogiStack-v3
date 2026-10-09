/**
 * Bots playing whole hands with nobody watching: the gym's watch mode without the screen. Every
 * seat is dealt two random cards at the start; before the flop the bots play their charts
 * (preflop.ts), after it the motive model (bot.ts), with the story narrowing the ranges as in
 * the Lab. Used for timing and for the stats report (stats.ts).
 */

import { cardToString } from '../cards';
import { applyEvent, initialState, unknownCards } from '../engine/replay';
import type { TableState } from '../engine/state';
import type { HandEvent, HandRecord } from '../hand/types';
import { botChoice, type BotChoice } from '../motives/bot';
import { preflopChoice, randomHand } from '../motives/preflop';
import { storyInput, type StoryCache } from '../motives/story';
import type { ChartChoice } from '../ranges/spot';

export interface Move {
  /** Index of the event in the hand. */
  event: number;
  seat: number;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  choice: BotChoice;
  /** Time the decision took, ms (postflop: the story update included). */
  ms: number;
}

export interface Played {
  hand: HandRecord;
  steps: TableState[];
  moves: Move[];
}

/** A small seeded random number generator (mulberry32), for repeatable runs. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
const MAX_EVENTS = 200;

/** Plays `start` (a hand with no events) to the end. */
export function playHand(
  start: HandRecord,
  charts: readonly ChartChoice[],
  o: {
    rand?: () => number;
    /** The cards' own stream (default `rand`): with it, two runs whose players decide differently still see the same cards. */
    dealRand?: () => number;
    cache?: StoryCache;
    now?: () => number;
  } = {},
): Played {
  const rand = o.rand ?? Math.random;
  const deal = o.dealRand ?? rand;
  const now = o.now ?? (() => performance.now());
  const cache: StoryCache = o.cache ?? new Map();

  // everyone dealt in gets two cards
  let pool = unknownCards(initialState(start));
  const players = start.players.map((p) => {
    if (p.cards || p.sittingOut || p.stack <= 0) return p;
    const cards = randomHand(pool, deal);
    pool = pool.filter((c) => cardToString(c) !== cards[0] && cardToString(c) !== cards[1]);
    return { ...p, cards };
  });
  let hand: HandRecord = { ...start, players, events: [] };
  const steps: TableState[] = [initialState(hand)];
  const moves: Move[] = [];

  const push = (e: HandEvent) => {
    hand = { ...hand, events: [...hand.events, e] };
    steps.push(applyEvent(steps[steps.length - 1]!, e, hand.events.length - 1));
  };

  while (hand.events.length < MAX_EVENTS) {
    const st = steps[steps.length - 1]!;
    if (st.phase === 'dealing') {
      const left = unknownCards(st);
      const cards: string[] = [];
      for (let i = 0; i < st.needCards; i++) cards.push(cardToString(left.splice(Math.floor(deal() * left.length), 1)[0]!));
      push({ type: 'board', cards });
      continue;
    }
    if (st.phase !== 'betting' || st.toAct === null) break;
    const street = STREETS[Math.max(0, st.board.length - 2)] ?? 'preflop';
    const t0 = now();
    let choice: BotChoice;
    if (st.board.length < 3) choice = preflopChoice(st, charts, rand);
    else {
      const input = storyInput(hand, steps, charts);
      if (!input) throw new Error('No story after the flop');
      if (cache.size > 2000) cache.clear();
      choice = botChoice(input, st, steps.length - 1, rand, cache, true);
    }
    moves.push({ event: hand.events.length, seat: st.toAct, street, choice, ms: now() - t0 });
    push(choice.event);
  }
  return { hand, steps, moves };
}
