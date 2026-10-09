/**
 * The Gym's tables: bots of mixed types on every seat (watching), or you in seat 1 among them
 * (playing, with two random cards so the bots can start). 6 or 9 seats.
 */

import { cardToString } from '../../core/cards';
import type { HandRecord } from '../../core/hand/types';
import { nextHandNo } from '../library';
import { toHandRecord, validateDraft } from '../wizard/draft';
import { watchDraft } from '../wizard/watchTable';

export type GymMode = 'watch' | 'play';

export function gymTable(mode: GymMode, size: 6 | 9, rand: () => number = Math.random): HandRecord {
  const base = watchDraft(rand, size);
  const draft =
    mode === 'watch'
      ? base
      : {
          ...base,
          tableName: 'Gym table',
          seats: base.seats.map((p, seat) => (seat === 0 && p ? { ...p, name: 'Hero', playerType: '' } : p)),
          heroSeat: 0,
        };
  const check = validateDraft(draft);
  if (check.errors.length) throw new Error(check.errors.join(' '));
  const hand = toHandRecord(draft, { id: crypto.randomUUID(), createdAt: new Date().toISOString(), handNo: nextHandNo() });
  if (mode === 'watch') return { ...hand, watch: {} };
  const deck = Array.from({ length: 52 }, (_, c) => c);
  const pick = () => cardToString(deck.splice(Math.floor(rand() * deck.length), 1)[0]!);
  return { ...hand, players: hand.players.map((p) => (p.seat === 0 ? { ...p, cards: [pick(), pick()] as [string, string] } : p)) };
}
