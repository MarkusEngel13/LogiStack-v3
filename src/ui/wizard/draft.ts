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
  type StraddleRule,
  type Venue,
} from '../../core/hand/types';
import type { SeatStyle } from '../../core/players/style';
import { CURRENCIES } from '../format';

export interface DraftPlayer {
  name: string;
  stack: Chips;
  playerType: string;
  tags: PlayerTag[];
  sittingOut: boolean;
  cards: [CardStr, CardStr] | null;
  squids: number;
  /** A saved player or profile from the Players page (then playerType is its base type). */
  style?: SeatStyle;
}

export type AnteKind = 'none' | 'each' | 'bb';

export interface WizardDraft {
  version: 2;
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
  /** Which straddles the table allows; the straddle itself is entered with the hand. */
  straddle: StraddleRule;
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
    sittingOut: false,
    cards: null,
    squids: 0,
  };
}

export function defaultDraft(): WizardDraft {
  const bb = 200;
  const size = 9;
  return {
    version: 2,
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
    straddle: { utg: false, button: false, restraddle: false, amount: 2 * bb },
    sevenDeuce: { enabled: false, bounty: 500, payers: 'dealt-in', suitedCounts: false, showdownOnly: false },
    squid: { enabled: false, value: 500 },
    title: '',
  };
}

/**
 * A draft remembered in the browser, brought up to date. Version 1 (2026-10-04) had
 * `straddle: { kind: 'none' | 'utg' | 'button', ... }`, meaning "post this straddle".
 */
export function upgradeDraft(raw: unknown): WizardDraft {
  const base = defaultDraft();
  if (!raw || typeof raw !== 'object') return base;
  type V1Straddle = { kind?: string; amount?: number; restraddle?: boolean };
  const d = raw as Omit<Partial<WizardDraft>, 'version' | 'straddle'> & { version?: number; straddle?: unknown };
  if (d.version === 2) return { ...base, ...(d as WizardDraft) };
  if (d.version !== 1) return base;
  const old = (d.straddle ?? {}) as V1Straddle;
  return {
    ...base,
    ...(d as unknown as WizardDraft),
    version: 2,
    straddle: {
      utg: old.kind === 'utg',
      button: old.kind === 'button',
      restraddle: !!old.restraddle,
      amount: old.amount ?? 2 * (d.blinds?.bb ?? base.blinds.bb),
    },
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

/** Rounds to the nearest 1, 2, 2.5 or 5 times a power of ten (in minor units): 62.5 → 50. */
export function niceRound(v: number): Chips {
  if (v <= 1) return Math.max(1, Math.round(v));
  let best = Math.round(v);
  let bestDist = Infinity;
  for (let e = 0; e <= 9; e++)
    for (const m of [1, 2, 2.5, 5]) {
      const c = m * 10 ** e;
      if (!Number.isInteger(c)) continue;
      const dist = Math.abs(Math.log(c / v));
      if (dist < bestDist) [best, bestDist] = [c, dist];
    }
  return best;
}

/**
 * New blinds. When the big blind changes, everything priced off it follows: the straddle and
 * the ante always; in money games also the stacks (they keep their depth in BB) and the 7-2 /
 * squid amounts (rounded to a sensible value). In chip games stacks stay put, like a
 * tournament level going up. The rake cap is a house rule and never changes.
 */
export function setBlinds(d: WizardDraft, blinds: { sb: Chips; bb: Chips }): WizardDraft {
  const f = d.blinds.bb > 0 && blinds.bb > 0 ? blinds.bb / d.blinds.bb : 1;
  if (f === 1) return { ...d, blinds };
  const scale = (v: Chips) => Math.max(1, Math.round(v * f));
  const money = d.currency.code !== 'CHIPS';
  return {
    ...d,
    blinds,
    straddle: { ...d.straddle, amount: scale(d.straddle.amount) },
    ante: { ...d.ante, amount: scale(d.ante.amount) },
    sevenDeuce: money ? { ...d.sevenDeuce, bounty: niceRound(d.sevenDeuce.bounty * f) } : d.sevenDeuce,
    squid: money ? { ...d.squid, value: niceRound(d.squid.value * f) } : d.squid,
    seats: money ? d.seats.map((p) => (p ? { ...p, stack: scale(p.stack) } : null)) : d.seats,
  };
}

export const isDealtIn = (p: DraftPlayer | null): p is DraftPlayer => !!p && !p.sittingOut && p.stack > 0;

export const straddlesAllowed = (d: WizardDraft) => d.straddle.utg || d.straddle.button;

function baseRecord(d: WizardDraft): HandRecord {
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
    houseRules: straddlesAllowed(d) ? { straddle: { ...d.straddle } } : undefined,
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
              ...(p.style ? { style: p.style } : {}),
              tags: p.tags.length ? [...p.tags] : undefined,
              cards: p.cards ?? undefined,
              squids: d.squid.enabled && p.squids > 0 ? p.squids : undefined,
              sittingOut: p.sittingOut || undefined,
            },
          ]
        : [],
    ),
    events: [],
  };
}

export function toHandRecord(d: WizardDraft, meta: { id: string; createdAt: string; handNo?: number }): HandRecord {
  return { ...baseRecord(d), ...meta };
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
  if (straddlesAllowed(d) && d.straddle.amount <= d.blinds.bb) errors.push('The straddle must be bigger than the big blind.');

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
    const state = initialState(baseRecord(d));
    return new Map(state.seats.map((s) => [s.seat, s.position]));
  } catch {
    return new Map();
  }
}

export const DRAFT_KEY = 'logistack.wizard.draft.v1';

/** The last setup is remembered, so next week's home game starts with the same people. */
export function loadDraft(): WizardDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? upgradeDraft(JSON.parse(raw)) : defaultDraft();
  } catch {
    return defaultDraft();
  }
}
