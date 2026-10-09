/**
 * The live table in this browser: who sits where at tonight's game, and which hand is being
 * entered. Set up once per sitting; every hand after that is the next hand at the same table
 * (the button moves, stacks carry over), so a hand starts with a tap on the button and your cards.
 */

import { nextHand } from '../../core/hand/nextHand';
import type { HandRecord } from '../../core/hand/types';
import { handAt as tableHand, stacksForNext, type LiveTable } from '../../core/live/table';
import { CURRENCIES } from '../format';
import { loadHands, nextHandNo } from '../library';

export { seatsFromHero, tableFromList, tableOf, type LiveSeat, type LiveTable } from '../../core/live/table';

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

/** How you like to enter cards on this device: hole cards from the 13x13 grid or exact; the board exact or as ranks. */
export interface LivePrefs {
  hole: 'grid' | 'cards';
  board: 'cards' | 'ranks';
}

const PREFS_KEY = 'logistack.livePrefs.v1';
const DEFAULT_PREFS: LivePrefs = { hole: 'grid', board: 'cards' };

export function loadPrefs(): LivePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<LivePrefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: LivePrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
}

export const HERO_NAME = 'Hero';

/** A first table: you and eight unknown players, in seat order from you. */
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
export const handAt = (t: LiveTable, session?: string): HandRecord =>
  tableHand(t, { id: crypto.randomUUID(), createdAt: new Date().toISOString(), handNo: nextHandNo(), session });

/** The next hand: the button moves, stacks carry over (see stacksForNext for a hand left unfinished). */
export function followingHand(h: HandRecord): HandRecord {
  const next = nextHand(h, stacksForNext(h), { id: crypto.randomUUID(), createdAt: new Date().toISOString(), handNo: nextHandNo() });
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
