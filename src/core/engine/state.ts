import type { Card } from '../cards';
import type { SeatStyle } from '../players/style';
import type { ActionKind, Chips, PlayerTag, RakeRule, SeatNo, SideGames } from '../hand/types';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

/**
 * betting  - waiting for `toAct`
 * dealing  - waiting for the next board cards (`needCards`)
 * showdown - river done (or all-in run-out finished) with two or more players left
 * complete - everyone else folded
 */
export type Phase = 'betting' | 'dealing' | 'showdown' | 'complete';

export type BetAction = Exclude<ActionKind, 'allin'>;

export interface SeatState {
  seat: SeatNo;
  name: string;
  playerType?: string;
  /** The Players page's style for this seat (see PlayerSetup.style). */
  style?: SeatStyle;
  tags: PlayerTag[];
  /** 'BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO', ...; '' when not dealt in. */
  position: string;
  dealtIn: boolean;
  startStack: Chips;
  /** Chips still behind. */
  stack: Chips;
  /** Live chips in front of the player on this street. */
  streetBet: Chips;
  /** Everything put in this hand, antes included. */
  totalIn: Chips;
  /** Antes (dead money): part of totalIn, but not part of the side-pot levels. */
  deadIn: Chips;
  folded: boolean;
  allIn: boolean;
  /** Has acted voluntarily on this street (posting a blind does not count). */
  acted: boolean;
  /** The bet level this player last acted at; used to decide whether betting re-opens for them. */
  matchedLevel: Chips;
  /** Known hole cards, or null. */
  cards: Card[] | null;
  shown: boolean;
  mucked: boolean;
  squids: number;
  lastAction: { action: BetAction | 'post'; to: Chips; allIn: boolean; blind: boolean } | null;
}

export interface Pot {
  amount: Chips;
  eligible: SeatNo[];
}

export type LogEntry =
  /** Blinds and antes come from the setup (event null); a straddle is an event. */
  | { kind: 'post'; event: number | null; seat: SeatNo; post: 'ante' | 'sb' | 'bb' | 'straddle'; amount: Chips; allIn: boolean }
  | {
      kind: 'action';
      event: number;
      street: Street;
      seat: SeatNo;
      action: BetAction;
      /** Street total after the action (bet/raise/call), 0 for fold/check. */
      to: Chips;
      /** Chips this action added. */
      added: Chips;
      allIn: boolean;
      /** Made without looking at the cards. */
      blind: boolean;
      potAfter: Chips;
    }
  | { kind: 'board'; event: number; street: Street; cards: Card[] }
  | { kind: 'refund'; event: number | null; seat: SeatNo; amount: Chips }
  | { kind: 'show'; event: number; seat: SeatNo; cards: Card[] }
  | { kind: 'muck'; event: number; seat: SeatNo };

export interface Transfer {
  from: SeatNo;
  to: SeatNo;
  amount: Chips;
  reason: 'seven-deuce' | 'squid';
}

export interface PotResult extends Pot {
  /** null when the winner can't be decided (someone's cards are unknown). */
  winners: SeatNo[] | null;
  /** Amount after rake, split between the winners. */
  shares: Record<number, Chips>;
  winningHand?: string;
}

export interface HandResult {
  showdown: boolean;
  rake: Chips;
  pots: PotResult[];
  /** Evaluated hands of players whose cards were seen. */
  hands: { seat: SeatNo; score: number; description: string }[];
  bounties: Transfer[];
  squid: { awarded: SeatNo[]; payout: Transfer[] } | null;
  /** false if some pot has no decided winner yet. */
  resolved: boolean;
  /** Per seat: final stack minus starting stack, after pots, rake and side games. */
  net: Record<number, Chips>;
  finalStacks: Record<number, Chips>;
}

export interface EngineRules {
  tableSeats: number;
  bb: Chips;
  rake?: RakeRule;
  sideGames?: SideGames;
}

export interface TableState {
  rules: EngineRules;
  street: Street;
  phase: Phase;
  board: Card[];
  button: SeatNo;
  /** Sorted by seat number. Includes players who sit out (dealtIn = false). */
  seats: SeatState[];
  toAct: SeatNo | null;
  /** Who posted the blinds (heads-up the button is the small blind). */
  blindSeats: { sb: SeatNo; bb: SeatNo };
  /** The biggest blind so far: the big blind, or the last straddle. */
  blindLevel: Chips;
  /** Straddlers in posting order. */
  straddlers: SeatNo[];
  /** Highest street bet a player must match. */
  currentBet: Chips;
  /** Size of the last full bet or raise on this street; the next raise must add at least this much. */
  lastFullRaise: Chips;
  /** Board cards awaited while phase === 'dealing'. */
  needCards: number;
  /** Chips collected from finished streets (current street bets not included). */
  potInMiddle: Chips;
  log: LogEntry[];
  eventsApplied: number;
  result: HandResult | null;
}

export interface LegalActions {
  seat: SeatNo;
  /** Chips needed to call, capped at the stack. */
  toCall: Chips;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
  /** Smallest legal bet/raise-to (going all-in for less is always allowed). */
  minTo: Chips;
  /** All-in total for this street. */
  maxTo: Chips;
}
