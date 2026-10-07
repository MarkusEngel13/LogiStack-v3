/**
 * Bots after the flop. A player holding real cards acts by the motive model: its combo gets a
 * chance of each option - the same chances that narrow its range in the story - and one is drawn
 * at random. So a bot's line always fits its range story: the quantum villain, collapsed to the
 * hand it really holds.
 *
 * The caller builds the story input up to the decision (storyInput with the steps so far); the
 * story is run here (with the caller's cache, so a hand costs one decision per new action).
 */

import { cardsFromComboIndex, cardToString, comboIndex } from '../cards';
import { legalActions, unknownCards } from '../engine/replay';
import type { Weights } from '../ranges/range';
import type { TableState } from '../engine/state';
import type { HandEvent } from '../hand/types';
import { decide } from './decide';
import { profileFor } from './profile';
import { rangesAt, runStory, situationOf, type StoryCache, type StoryInput } from './story';

export interface BotOption {
  label: string;
  /** The bot's chance of taking it, with its cards. */
  p: number;
  event: HandEvent;
}

export interface BotChoice {
  seat: number;
  options: BotOption[];
  /** Index of the option drawn. */
  picked: number;
  event: HandEvent;
}

/**
 * The bot's action for the player to act in `state` (= the hand after `step` events), after the
 * flop. `input`: storyInput() of the hand's steps up to `step`. `rand` draws the option (0..1).
 */
export function botChoice(input: StoryInput, state: TableState, step: number, rand: () => number = Math.random, cache?: StoryCache): BotChoice {
  const legal = legalActions(state);
  if (!legal) throw new Error('Nobody is to act');
  if (state.board.length < 3) throw new Error('Bots play after the flop only (for now)');
  const me = state.seats.find((s) => s.seat === legal.seat)!;
  if (!me.cards) throw new Error(`${me.name}'s cards are unknown: a bot needs real cards`);

  const story = runStory(input, cache);
  const { situation, opps } = situationOf(state, me.seat);
  const seen = rangesAt(input, story, step, { observer: me.seat });
  const mine = (rangesAt(input, story, step).get(me.seat) ?? new Float32Array(1326).fill(1)).slice();
  // its own cards are in its range, however unlikely the model found them
  const combo = comboIndex(me.cards[0]!, me.cards[1]!);
  mine[combo] = Math.max(mine[combo]!, 1e-3);
  const theirs = opps.map((o) => seen.get(o.seat) ?? new Float32Array(1326).fill(1));
  const d = decide(profileFor(me), situation, mine, theirs);

  const toEvent = (kind: string, amount: number, allIn: boolean): HandEvent => {
    const base = { type: 'action' as const, seat: me.seat };
    if (kind === 'fold' || kind === 'check' || kind === 'call') return { ...base, action: kind };
    // a bet's amount is its total; a raise's amount is what it adds to the player's street bet
    const to = kind === 'bet' ? amount : me.streetBet + amount;
    if (allIn || to >= legal.maxTo) return { ...base, action: 'allin' };
    return { ...base, action: kind === 'bet' ? 'bet' : 'raise', to: Math.max(to, legal.minTo) };
  };
  let total = 0;
  const options: BotOption[] = d.options.map((o, i) => {
    const p = d.probs[i]![combo]!;
    total += Number.isNaN(p) ? 0 : p;
    return { label: o.label, p: Number.isNaN(p) ? 0 : p, event: toEvent(o.kind, o.amount, o.allIn) };
  });
  for (const o of options) o.p = total > 0 ? o.p / total : 1 / options.length;

  let r = rand();
  let picked = options.length - 1;
  for (let i = 0; i < options.length; i++) {
    r -= options[i]!.p;
    if (r < 0) {
      picked = i;
      break;
    }
  }
  return { seat: me.seat, options, picked, event: options[picked]!.event };
}

/**
 * A hand drawn from what is left of a range, by weight, among the cards nobody has seen: the
 * quantum villain collapsing (a showdown, or a bot that needs real cards). Null if none is left.
 */
export function cardsFromRange(state: TableState, w: Weights, rand: () => number = Math.random): [string, string] | null {
  const free = new Set(unknownCards(state));
  const pool: { combo: number; w: number }[] = [];
  let total = 0;
  for (let c = 0; c < 1326; c++) {
    if (!(w[c]! > 0)) continue;
    const [a, b] = cardsFromComboIndex(c);
    if (!free.has(a) || !free.has(b)) continue;
    pool.push({ combo: c, w: w[c]! });
    total += w[c]!;
  }
  let r = rand() * total;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) {
      const [a, b] = cardsFromComboIndex(p.combo);
      return [cardToString(a), cardToString(b)];
    }
  }
  const last = pool[pool.length - 1];
  if (!last) return null;
  const [a, b] = cardsFromComboIndex(last.combo);
  return [cardToString(a), cardToString(b)];
}
