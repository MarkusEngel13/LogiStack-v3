/**
 * Hand record, format v0.
 *
 * A hand is stored as SETUP + EVENTS and nothing else. Stacks, pots, side pots, whose turn it
 * is and the result are always recomputed by replaying the events (see engine/replay.ts).
 * The setup is what the hand wizard fills in; the events are what the replayer steps through
 * and what the Lab appends to (or truncates when you branch).
 *
 * Money: every amount is an integer in minor units (cents for EUR/USD, 1 for plain chips),
 * so a 1/2 EUR game has sb = 100, bb = 200. No floats anywhere in the engine.
 * Blinds, antes and straddles are posted automatically from the setup; they are not events.
 */

export const HAND_FORMAT = 'logistack.hand/0' as const;

export type Chips = number;
/** Seat number, 0-based, clockwise around the table, always < table.seats. */
export type SeatNo = number;
/** "As", "Td", "2c" */
export type CardStr = string;

export type Venue = 'home' | 'casino';

/** Built-in status badges. Free text is allowed for house-specific tags. */
export type PlayerTag = 'winning' | 'tilt' | 'drinking' | (string & {});

export interface Currency {
  code: string; // 'EUR', 'USD', 'CHIPS'
  minorPerMajor: number; // 100 for EUR/USD, 1 for chips
}

export interface TableSetup {
  /** 2..10. The wizard offers 6, 8, 9 and 10. */
  seats: number;
  venue: Venue;
  name?: string;
  currency: Currency;
  blinds: { sb: Chips; bb: Chips };
  /** 'each' = every player antes; 'bb' = the big blind posts one ante for the whole table. */
  ante?: { kind: 'each' | 'bb'; amount: Chips };
  /** Casino rake. Leave out for no rake (home games). */
  rake?: RakeRule;
}

export interface RakeRule {
  /** 0.05 = 5 % */
  percent: number;
  /** Maximum rake per hand, 0 = uncapped. */
  cap: Chips;
  /** No rake if the hand ends before the flop. */
  noFlopNoDrop: boolean;
}

export interface PlayerSetup {
  seat: SeatNo;
  name: string;
  stack: Chips;
  /** Free text: 'Reg', 'Fish', 'Nit', 'LAG', 'Maniac', 'Whale', ... */
  playerType?: string;
  tags?: PlayerTag[];
  /** Known hole cards. Leave out if unknown; a 'show' event can reveal them later. */
  cards?: [CardStr, CardStr];
  /** Squid tokens held at the start of this hand (squid game). */
  squids?: number;
  /** Seated but not dealt in. */
  sittingOut?: boolean;
}

/** A live straddle, listed in posting order (re-straddles follow the first one). */
export interface Straddle {
  seat: SeatNo;
  amount: Chips;
}

export interface SideGames {
  sevenDeuce?: SevenDeuceRule;
  squid?: SquidRule;
}

/** Win a pot holding 7-2 and the payers each pay you a bounty. */
export interface SevenDeuceRule {
  bounty: Chips;
  payers: 'dealt-in' | 'all-seated';
  suitedCounts: boolean;
  /** true: only a showdown win counts. false: winning uncontested also counts if the 7-2 is shown. */
  showdownOnly: boolean;
}

/** Every pot winner without a squid gets one; the last player without a squid pays every holder. */
export interface SquidRule {
  value: Chips;
}

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export type HandEvent =
  /** `to` = the player's total bet on this street after the action ("raise to 600"). Needed for bet/raise only. */
  | { type: 'action'; seat: SeatNo; action: ActionKind; to?: Chips }
  /** Flop (3 cards), turn (1) or river (1). */
  | { type: 'board'; cards: CardStr[] }
  /** Reveal hole cards: at showdown, or a voluntary show after winning. */
  | { type: 'show'; seat: SeatNo; cards?: [CardStr, CardStr] }
  /** Give up at showdown without showing. */
  | { type: 'muck'; seat: SeatNo };

export interface HandRecord {
  format: typeof HAND_FORMAT;
  id: string;
  /** Short running number shown in the replayer header ("Hand #142"); the library assigns it. */
  handNo?: number;
  createdAt: string; // ISO 8601
  title?: string;
  notes?: string;
  table: TableSetup;
  sideGames?: SideGames;
  button: SeatNo;
  hero?: SeatNo;
  players: PlayerSetup[];
  straddles?: Straddle[];
  events: HandEvent[];
}
