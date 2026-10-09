/**
 * Tonight's table at the live screen: who sits where, as you see them - you first, then the
 * players clockwise from your left. Each hand is set up from it (or from the hand before), and
 * the button is tapped at the start of each hand, so the table itself never asks for it.
 */

import { initialState, replay } from '../engine/replay';
import type { TableState } from '../engine/state';
import type { Chips, Currency, HandRecord } from '../hand/types';
import type { SeatStyle } from '../players/style';
import { handOver } from './quick';

export interface LiveSeat {
  name: string;
  stack: Chips;
  playerType: string;
  style?: SeatStyle;
  sittingOut?: boolean;
}

export interface LiveTable {
  name: string;
  /** Seats at the table. Tables set up since the tap flow have exactly one seat per player. */
  seats: number;
  currency: Currency;
  blinds: { sb: Chips; bb: Chips };
  /** What a new player sits down with. */
  startStack: Chips;
  /** Your usual open, in big blinds: where the amount box starts before anyone raised. */
  openBB: number;
  hero: number;
  /** The last button seen; each hand asks for it again with one tap. */
  button: number;
  /**
   * Index = seat; null = empty. Hero's seat holds Hero. Since the tap flow, Hero is seat 0 and the
   * others follow clockwise without gaps; tables saved before keep their numbering until changed.
   */
  players: (LiveSeat | null)[];
}

/** The seats with a player, clockwise from Hero's (Hero first). */
export function seatsFromHero(t: LiveTable): number[] {
  const out: number[] = [];
  for (let step = 0; step < t.seats; step++) {
    const seat = (t.hero + step) % t.seats;
    if (t.players[seat]) out.push(seat);
  }
  return out;
}

/**
 * The table from a list in seat order from Hero (Hero first): Hero on seat 0, the others on 1, 2, ...
 * `button`: the list index of the button, kept when it's still there (else the player on your right).
 */
export function tableFromList(t: LiveTable, list: readonly LiveSeat[], button?: number): LiveTable {
  return {
    ...t,
    seats: list.length,
    hero: 0,
    button: button !== undefined && button >= 0 && button < list.length ? button : list.length - 1,
    players: [...list],
  };
}

/** The table as it stands at the start of a hand (for changing it between hands). */
export function tableOf(h: HandRecord, prev: LiveTable): LiveTable {
  const players: (LiveSeat | null)[] = Array.from({ length: h.table.seats }, () => null);
  for (const p of h.players)
    players[p.seat] = { name: p.name, stack: p.stack, playerType: p.playerType ?? '', ...(p.style ? { style: p.style } : {}), ...(p.sittingOut ? { sittingOut: true } : {}) };
  return { ...prev, seats: h.table.seats, blinds: h.table.blinds, currency: h.table.currency, hero: h.hero ?? prev.hero, button: h.button, players };
}

/** The first hand at this table: no cards, no actions. */
export function handAt(t: LiveTable, o: { id: string; createdAt: string; handNo?: number; session?: string }): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: o.id,
    handNo: o.handNo,
    createdAt: o.createdAt,
    table: { seats: t.seats, venue: 'home', name: t.name || undefined, currency: t.currency, blinds: t.blinds },
    button: t.button,
    hero: t.hero,
    players: t.players.flatMap((p, seat) =>
      p
        ? [
            {
              seat,
              name: p.name,
              stack: p.stack,
              ...(seat !== t.hero ? { playerType: p.playerType || 'Unknown' } : {}),
              ...(p.style ? { style: p.style } : {}),
              ...(p.sittingOut ? { sittingOut: true } : {}),
            },
          ]
        : [],
    ),
    events: [],
    quick: { guessedSuits: true },
    ...(o.session ? { session: o.session } : {}),
  };
}

/**
 * Where the stacks stand for the next hand: the end of the hand when it's over; else whoever
 * folded keeps what he has left and the players still in are back where they started (their pot
 * isn't decided).
 */
export function stacksForNext(h: HandRecord): TableState {
  let now: TableState;
  try {
    now = replay(h);
  } catch {
    now = initialState(h);
  }
  if (handOver(now)) return now;
  return { ...now, result: null, seats: now.seats.map((s) => (s.folded ? s : { ...s, stack: s.startStack })) };
}
