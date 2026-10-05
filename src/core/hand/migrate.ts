import type { HandEvent, HandRecord } from './types';

/**
 * Brings a saved or imported hand up to the current format.
 * - Until 2026-10-05 straddles were part of the setup (`straddles: [{ seat, amount }]`);
 *   now they are events at the start of the hand.
 * - `players[].blind` (2026-10-04, briefly) is dropped; blind raises live on the action.
 */
export function migrateHand(raw: unknown): HandRecord {
  const { straddles, ...rest } = raw as HandRecord & { straddles?: { seat: number; amount: number }[] };
  const players = rest.players.map((p) => {
    const { blind: _blind, ...player } = p as typeof p & { blind?: boolean };
    return player;
  });
  if (!straddles?.length) return { ...rest, players };
  const straddleEvents: HandEvent[] = straddles.map((s) => ({ type: 'straddle', seat: s.seat, amount: s.amount }));
  return { ...rest, players, events: [...straddleEvents, ...rest.events] };
}
