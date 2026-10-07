/**
 * The next hand at the same table (the gym). The button moves to the next player dealt in, stacks
 * carry over from the hand just played (a player left with less than a big blind rebuys to what
 * they started with), Hero gets two random cards and everyone else's stay unknown - bots get
 * theirs when they first act. Players, types, statuses, house rules and side games stay; so does
 * watch mode, but a new watched hand isn't kept until you pin it.
 */

import { cardToString } from '../cards';
import type { TableState } from '../engine/state';
import type { HandRecord, PlayerSetup } from './types';

export function nextHand(
  prev: HandRecord,
  final: TableState,
  o: { id: string; createdAt: string; handNo?: number; rand?: () => number },
): HandRecord {
  const rand = o.rand ?? Math.random;
  const bb = prev.table.blinds.bb;
  const after = (seat: number) => final.result?.finalStacks[seat] ?? final.seats.find((s) => s.seat === seat)?.stack;

  const players: PlayerSetup[] = prev.players.map((p) => {
    const left = after(p.seat) ?? p.stack;
    const seat = final.seats.find((s) => s.seat === p.seat);
    const { cards: _gone, ...rest } = p;
    void _gone;
    return {
      ...rest,
      stack: left < bb ? p.stack : left,
      ...(prev.sideGames?.squid && seat ? { squids: seat.squids } : {}),
    };
  });

  // the button moves to the next seat that will be dealt in
  const inPlay = players.filter((p) => !p.sittingOut && p.stack > 0).map((p) => p.seat).sort((a, b) => a - b);
  const button = inPlay.find((s) => s > prev.button) ?? inPlay[0] ?? prev.button;

  // Hero's two cards, at random
  if (prev.hero !== undefined) {
    const deck = Array.from({ length: 52 }, (_, c) => c);
    const pick = () => deck.splice(Math.floor(rand() * deck.length), 1)[0]!;
    const cards: [string, string] = [cardToString(pick()), cardToString(pick())];
    const i = players.findIndex((p) => p.seat === prev.hero);
    if (i >= 0) players[i] = { ...players[i]!, cards };
  }

  const { ranges: _ranges, title: _title, notes: _notes, watch, ...table } = prev;
  void _ranges;
  void _title;
  void _notes;
  return { ...table, id: o.id, createdAt: o.createdAt, handNo: o.handNo, button, players, events: [], ...(watch ? { watch: {} } : {}) };
}
