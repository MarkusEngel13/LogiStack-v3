/**
 * The hand wizard's working copy. Amounts are minor units like the hand format.
 * toHandRecord() turns it into a HandRecord with no events; validateDraft() runs the engine's
 * own setup checks, so the wizard can never produce a hand the engine rejects.
 */

import { initialState, HandError } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import {
  HAND_FORMAT,
  type CardStr,
  type Chips,
  type Currency,
  type HandRecord,
  type PlayerTag,
  type RakeRule,
  type SevenDeuceRule,
  type Straddle,
  type Venue,
} from '../../core/hand/types';
import { CURRENCIES } from '../format';

export interface DraftPlayer {
  name: string;
  stack: Chips;
  playerType: string;
  tags: PlayerTag[];
  blind: boolean;
  sittingOut: boolean;
  cards: [CardStr, CardStr] | null;
  squids: number;
}

export type StraddleKind = 'none' | 'utg' | 'button';
export type AnteKind = 'none' | 'each' | 'bb';

export interface WizardDraft {
  version: 1;
  tableSize: number;
  venue: Venue;
  tableName: string;
  currency: Currency;
  blinds: { sb: Chips; bb: Chips };
  ante: { kind: AnteKind; amount: Chips };
  /** Used only when venue === 'casino'. */
  rake: RakeRule;
  /** Index = seat number; null = empty seat. */
  seats: (DraftPlayer | null)[];
  heroSeat: number | null;
  button: number;
  straddle: { kind: StraddleKind; amount: Chips; restraddle: boolean };
  sevenDeuce: { enabled: boolean } & SevenDeuceRule;
  squid: { enabled: boolean; value: Chips };
  title: string;
}

export function newPlayer(seat: number, bb: Chips, isHero = false): DraftPlayer {
  return {
    name: isHero ? 'Hero' : `Player ${seat + 1}`,
    stack: 100 * bb,
    playerType: isHero ? '' : 'Unknown',
    tags: [],
    blind: false,
    sittingOut: false,
    cards: null,
    squids: 0,
  };
}

export function defaultDraft(): WizardDraft {
  const bb = 200;
  const size = 9;
  return {
    version: 1,
    tableSize: size,
    venue: 'home',
    tableName: '',
    currency: CURRENCIES[0]!,
    blinds: { sb: 100, bb },
    ante: { kind: 'none', amount: bb },
    rake: { percent: 0.05, cap: 500, noFlopNoDrop: true },
    seats: Array.from({ length: size }, (_, i) => newPlayer(i, bb, i === 0)),
    heroSeat: 0,
    button: 0,
    straddle: { kind: 'none', amount: 2 * bb, restraddle: false },
    sevenDeuce: { enabled: false, bounty: 500, payers: 'dealt-in', suitedCounts: false, showdownOnly: false },
    squid: { enabled: false, value: 500 },
    title: '',
  };
}

/** Change the number of seats, keeping the players who still fit. */
export function resizeTable(d: WizardDraft, size: number): WizardDraft {
  const seats = Array.from({ length: size }, (_, i) => (i < d.seats.length ? d.seats[i]! : newPlayer(i, d.blinds.bb)));
  return {
    ...d,
    tableSize: size,
    seats,
    heroSeat: d.heroSeat !== null && d.heroSeat < size ? d.heroSeat : null,
    button: d.button < size ? d.button : 0,
  };
}

/** Switch currency; amounts keep their face value (€2 becomes 2 chips). */
export function setCurrency(d: WizardDraft, currency: Currency): WizardDraft {
  const f = currency.minorPerMajor / d.currency.minorPerMajor;
  const r = (v: Chips) => Math.round(v * f);
  return {
    ...d,
    currency,
    blinds: { sb: r(d.blinds.sb), bb: r(d.blinds.bb) },
    ante: { ...d.ante, amount: r(d.ante.amount) },
    rake: { ...d.rake, cap: r(d.rake.cap) },
    straddle: { ...d.straddle, amount: r(d.straddle.amount) },
    sevenDeuce: { ...d.sevenDeuce, bounty: r(d.sevenDeuce.bounty) },
    squid: { ...d.squid, value: r(d.squid.value) },
    seats: d.seats.map((p) => (p ? { ...p, stack: r(p.stack) } : null)),
  };
}

export const isDealtIn = (p: DraftPlayer | null): p is DraftPlayer => !!p && !p.sittingOut && p.stack > 0;

function baseRecord(d: WizardDraft, straddles: Straddle[]): HandRecord {
  const anyRule = d.sevenDeuce.enabled || d.squid.enabled;
  const { enabled: _sd, ...sevenDeuce } = d.sevenDeuce;
  return {
    format: HAND_FORMAT,
    id: '',
    createdAt: '',
    title: d.title.trim() || undefined,
    table: {
      seats: d.tableSize,
      venue: d.venue,
      name: d.tableName.trim() || undefined,
      currency: d.currency,
      blinds: { ...d.blinds },
      ante: d.ante.kind === 'none' || d.ante.amount <= 0 ? undefined : { kind: d.ante.kind, amount: d.ante.amount },
      rake: d.venue === 'casino' ? { ...d.rake } : undefined,
    },
    sideGames: anyRule
      ? {
          sevenDeuce: d.sevenDeuce.enabled ? sevenDeuce : undefined,
          squid: d.squid.enabled ? { value: d.squid.value } : undefined,
        }
      : undefined,
    button: d.button,
    hero: d.heroSeat ?? undefined,
    players: d.seats.flatMap((p, seat) =>
      p
        ? [
            {
              seat,
              name: p.name.trim() || `Seat ${seat + 1}`,
              stack: p.stack,
              playerType: p.playerType || undefined,
              tags: p.tags.length ? [...p.tags] : undefined,
              cards: p.cards ?? undefined,
              squids: d.squid.enabled && p.squids > 0 ? p.squids : undefined,
              blind: p.blind || undefined,
              sittingOut: p.sittingOut || undefined,
            },
          ]
        : [],
    ),
    straddles: straddles.length ? straddles : undefined,
    events: [],
  };
}

/** Which seats straddle, derived from the button like at the table. Empty if not possible. */
export function straddlesFor(d: WizardDraft): Straddle[] {
  if (d.straddle.kind === 'none') return [];
  let state: TableState;
  try {
    state = initialState(baseRecord(d, []));
  } catch {
    return [];
  }
  const dealt = state.seats.filter((s) => s.dealtIn);
  if (dealt.length < 3) return [];
  const next = (from: number) => {
    for (let step = 1; step <= d.tableSize; step++) {
      const seat = (from + step) % d.tableSize;
      if (dealt.some((s) => s.seat === seat)) return seat;
    }
    return from;
  };
  const sb = state.seats.find((s) => s.position === 'SB')?.seat;
  const bb = state.seats.find((s) => s.position === 'BB')!.seat;
  const btn = state.seats.find((s) => s.position === 'BTN')?.seat;

  const first = d.straddle.kind === 'utg' ? next(bb) : btn;
  if (first === undefined || first === sb || first === bb) return [];
  const list: Straddle[] = [{ seat: first, amount: d.straddle.amount }];
  if (d.straddle.kind === 'utg' && d.straddle.restraddle) {
    const second = next(first);
    if (second !== sb && second !== bb && second !== first) list.push({ seat: second, amount: d.straddle.amount * 2 });
  }
  return list;
}

export function toHandRecord(d: WizardDraft, meta: { id: string; createdAt: string; handNo?: number }): HandRecord {
  return { ...baseRecord(d, straddlesFor(d)), ...meta };
}

export interface DraftCheck {
  errors: string[];
  /** The table after blinds are posted, when the setup is valid. */
  state: TableState | null;
}

export function validateDraft(d: WizardDraft): DraftCheck {
  const errors: string[] = [];
  if (!(d.blinds.bb > 0)) errors.push('The big blind must be more than zero.');
  if (d.blinds.sb > d.blinds.bb) errors.push('The small blind is bigger than the big blind.');
  if (d.venue === 'casino' && (d.rake.percent < 0 || d.rake.percent > 0.25)) errors.push('Rake must be between 0 and 25 %.');

  const dealt = d.seats.filter(isDealtIn);
  if (dealt.length < 2) errors.push('At least two players must be dealt in.');
  d.seats.forEach((p, seat) => {
    if (p && !p.sittingOut && p.stack <= 0) errors.push(`Seat ${seat + 1} (${p.name}) has no chips.`);
  });
  if (d.heroSeat !== null && !d.seats[d.heroSeat]) errors.push('Hero sits in an empty seat.');
  if (!isDealtIn(d.seats[d.button] ?? null)) errors.push('Put the dealer button on a player who is dealt in.');
  if (d.straddle.kind !== 'none') {
    if (d.straddle.amount <= d.blinds.bb) errors.push('The straddle must be bigger than the big blind.');
    else if (dealt.length >= 3 && straddlesFor(d).length === 0) errors.push('Nobody can straddle from this button position.');
  }

  let state: TableState | null = null;
  if (errors.length === 0) {
    try {
      state = initialState(toHandRecord(d, { id: 'preview', createdAt: '' }));
    } catch (e) {
      errors.push(e instanceof HandError ? e.message.replace(/^Setup: /, '') : String(e));
    }
  }
  return { errors, state };
}

/** Positions only (BTN, SB, ...), even while other parts of the draft are still invalid. */
export function previewPositions(d: WizardDraft): Map<number, string> {
  try {
    const state = initialState(baseRecord(d, []));
    return new Map(state.seats.map((s) => [s.seat, s.position]));
  } catch {
    return new Map();
  }
}
