/**
 * The live table: who sits where at tonight's game, and which hand is being entered. Set up once
 * per sitting; every hand after that is the next hand at the same table (button moves, stacks
 * carry over), so a hand starts with nothing to fill in but your cards.
 */

import { initialState, replay } from '../../core/engine/replay';
import { handOver } from '../../core/live/quick';
import { nextHand } from '../../core/hand/nextHand';
import type { Chips, Currency, HandRecord } from '../../core/hand/types';
import type { SeatStyle } from '../../core/players/style';
import { CURRENCIES } from '../format';
import { loadHands, nextHandNo } from '../library';

export interface LiveSeat {
  name: string;
  stack: Chips;
  playerType: string;
  style?: SeatStyle;
  sittingOut?: boolean;
}

export interface LiveTable {
  name: string;
  seats: number;
  currency: Currency;
  blinds: { sb: Chips; bb: Chips };
  /** What a new player sits down with. */
  startStack: Chips;
  /** Your usual open, in big blinds (each limper adds one). */
  openBB: number;
  hero: number;
  button: number;
  /** Index = seat; null = empty. Hero's seat holds Hero. */
  players: (LiveSeat | null)[];
}

interface LiveState {
  table: LiveTable;
  /** The hand on screen (saved in the library once it has cards or actions). */
  hand?: HandRecord;
}

const KEY = 'logistack.live.v1';

export function loadLive(): LiveState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LiveState) : null;
  } catch {
    return null;
  }
}

export function saveLive(s: LiveState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: the table lasts until the page reloads
  }
}

export const HERO_NAME = 'Hero';

export function defaultTable(): LiveTable {
  const bb = 25;
  const seats = 9;
  return {
    name: 'Home game',
    seats,
    currency: CURRENCIES[0]!,
    blinds: { sb: 10, bb },
    startStack: 100 * bb,
    openBB: 3,
    hero: 0,
    button: seats - 1,
    players: Array.from({ length: seats }, (_, i) => (i === 0 ? { name: HERO_NAME, stack: 100 * bb, playerType: '' } : { name: `Seat ${i + 1}`, stack: 100 * bb, playerType: 'Unknown' })),
  };
}

/** The first hand of a sitting at this table: no cards, no actions. */
export function handAt(t: LiveTable, session?: string): HandRecord {
  const id = crypto.randomUUID();
  return {
    format: 'logistack.hand/0',
    id,
    handNo: nextHandNo(),
    createdAt: new Date().toISOString(),
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
    ...(session ? { session } : {}),
  };
}

/** The table as it stands at the start of a hand (for editing it between hands). */
export function tableOf(h: HandRecord, prev: LiveTable): LiveTable {
  const players: (LiveSeat | null)[] = Array.from({ length: h.table.seats }, () => null);
  for (const p of h.players)
    players[p.seat] = { name: p.name, stack: p.stack, playerType: p.playerType ?? '', ...(p.style ? { style: p.style } : {}), ...(p.sittingOut ? { sittingOut: true } : {}) };
  return { ...prev, seats: h.table.seats, blinds: h.table.blinds, currency: h.table.currency, hero: h.hero ?? prev.hero, button: h.button, players };
}

/** The next hand: button moves, stacks carry over (from the start of the hand if it isn't finished). */
export function followingHand(h: HandRecord): HandRecord {
  let final;
  try {
    const s = replay(h);
    final = handOver(s) ? s : initialState(h);
  } catch {
    final = initialState(h);
  }
  const next = nextHand(h, final, { id: crypto.randomUUID(), createdAt: new Date().toISOString(), handNo: nextHandNo() });
  // nextHand deals Hero two cards for the gym; at the live table you tap your real ones
  return { ...next, players: next.players.map(({ cards: _c, ...p }) => (void _c, p)), quick: { guessedSuits: true } };
}

/** Whether a hand has anything worth keeping (your cards or an action). */
export const worthKeeping = (h: HandRecord) => h.events.length > 0 || h.players.some((p) => p.cards);

/** The hands of this sitting, oldest first. */
export function sessionHands(h: HandRecord): HandRecord[] {
  const key = h.session ?? h.id;
  return loadHands()
    .filter((x) => (x.session ?? x.id) === key)
    .sort((a, b) => (a.handNo ?? 0) - (b.handNo ?? 0));
}
