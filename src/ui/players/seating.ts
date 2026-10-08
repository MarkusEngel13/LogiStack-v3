/**
 * Saved players at a table: refreshing a seated player's style, and the test table the Players
 * page deals (your last wizard table, with the player and your other saved players seated).
 */

import { cardToString } from '../../core/cards';
import type { HandRecord } from '../../core/hand/types';
import type { SeatStyle } from '../../core/players/style';
import { nextHandNo } from '../library';
import { loadDraft, newPlayer, toHandRecord, validateDraft, type WizardDraft } from '../wizard/draft';
import { loadPlayers, loadProfiles, seatStyleOfPlayer, seatStyleOfProfile } from './store';

/** A seat's saved style as it is saved now (a player or profile edited since it was seated). */
export function freshStyle(style: SeatStyle): SeatStyle {
  const profiles = loadProfiles();
  if (style.playerId) {
    const pl = loadPlayers().find((p) => p.id === style.playerId);
    if (pl) return seatStyleOfPlayer(pl, profiles);
  }
  if (style.profileId) {
    const pr = profiles.find((p) => p.id === style.profileId);
    if (pr) return { ...seatStyleOfProfile(pr), label: style.label };
  }
  return style;
}

export function refreshStyles(d: WizardDraft): WizardDraft {
  return { ...d, seats: d.seats.map((p) => (p?.style ? { ...p, style: freshStyle(p.style), playerType: freshStyle(p.style).settings.base } : p)) };
}

export type TestMode = 'play' | 'watch';

/**
 * A table to test a style at: the last wizard table's game (blinds, currency, venue, rules),
 * 6-max, the style in seat 2, your other saved players next (then Unknowns), and you in seat 1
 * when playing - with two random cards, so the bots can start. Watching: no Hero, bots everywhere.
 */
export function testTable(style: SeatStyle, mode: TestMode, rand: () => number = Math.random): HandRecord {
  const last = loadDraft();
  const size = 6;
  const bb = last.blinds.bb;
  const stack = 100 * bb;
  const others = loadPlayers()
    .filter((p) => p.id !== style.playerId)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const profiles = loadProfiles();
  let k = 0;
  const seats = Array.from({ length: size }, (_, seat) => {
    const blank = { ...newPlayer(seat, bb), stack };
    if (seat === 0 && mode === 'play') return { ...blank, name: 'Hero', playerType: '' };
    if (seat === 1) return { ...blank, name: style.label, playerType: style.settings.base, style };
    const pl = others[k++];
    if (!pl) return { ...blank, name: `Unknown ${seat + 1}`, playerType: 'Unknown' };
    const st = seatStyleOfPlayer(pl, profiles);
    return { ...blank, name: pl.name, playerType: st.settings.base, style: st };
  });
  const draft: WizardDraft = {
    ...last,
    tableSize: size,
    tableName: `Testing ${style.label}`,
    seats,
    heroSeat: mode === 'play' ? 0 : null,
    button: Math.floor(rand() * size),
    title: `Testing ${style.label}`,
  };
  const check = validateDraft(draft);
  if (check.errors.length) throw new Error(check.errors.join(' '));
  const hand = toHandRecord(draft, { id: crypto.randomUUID(), createdAt: new Date().toISOString(), handNo: nextHandNo() });
  if (mode === 'watch') return { ...hand, watch: {} };
  // Hero's two cards
  const deck = Array.from({ length: 52 }, (_, c) => c);
  const pick = () => cardToString(deck.splice(Math.floor(rand() * deck.length), 1)[0]!);
  return { ...hand, players: hand.players.map((p) => (p.seat === 0 ? { ...p, cards: [pick(), pick()] as [string, string] } : p)) };
}
