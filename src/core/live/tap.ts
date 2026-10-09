/**
 * The live screen's tap flow for actions: tap the player who acts, then what he does.
 *
 * Everyone the engine would ask before him passes - checks when it's free, folds facing a bet -
 * so a street where most players fold takes two taps per player who does something. Every move
 * is played through the engine from the current state, so the events are always legal and the
 * pot, stacks and all-ins come out right.
 */

import { applyEvent, legalActions, potTotal } from '../engine/replay';
import type { LegalActions, TableState } from '../engine/state';
import type { Chips, HandEvent, SeatNo } from '../hand/types';
import { fractionText, handOver } from './quick';

export type Move = 'fold' | 'check' | 'call' | 'allin' | { to: Chips };

/** Rounds an amount to the table's chip unit (a fifth of the big blind: 5 cents at 10/25). */
export function roundChips(state: TableState, amount: number): number {
  const unit = Math.max(1, Math.round(state.rules.bb / 5));
  return Math.max(unit, Math.round(amount / unit) * unit);
}

const apply = (state: TableState, events: readonly HandEvent[]) => events.reduce((st, e) => applyEvent(st, e, st.eventsApplied), state);

/** Passing: a check when it's free, else a fold. */
const pass = (legal: LegalActions): HandEvent => ({ type: 'action', seat: legal.seat, action: legal.canCheck ? 'check' : 'fold' });

/** The players still to act on this street, in turn order from the player to act. */
export function stillToAct(state: TableState): SeatNo[] {
  if (state.phase !== 'betting' || state.toAct === null) return [];
  const n = state.rules.tableSeats;
  const out: SeatNo[] = [];
  for (let step = 0; step < n; step++) {
    const s = state.seats.find((x) => x.seat === (state.toAct! + step) % n);
    if (!s || !s.dealtIn || s.folded || s.allIn) continue;
    if (s.acted && s.streetBet >= state.currentBet) continue;
    out.push(s.seat);
  }
  return out;
}

/** The events that let everyone before `seat` pass, and the state after them. null if he's not to act on this street. */
export function passUntil(state: TableState, seat: SeatNo): { events: HandEvent[]; state: TableState } | null {
  if (!stillToAct(state).includes(seat)) return null;
  let st = state;
  const events: HandEvent[] = [];
  for (let i = 0; i <= state.rules.tableSeats; i++) {
    const legal = legalActions(st);
    if (!legal || st.street !== state.street) return null;
    if (legal.seat === seat) return { events, state: st };
    const ev = pass(legal);
    st = applyEvent(st, ev, st.eventsApplied);
    events.push(ev);
  }
  return null;
}

/** A move as the event the engine takes: a size is kept between the smallest raise and all-in. */
function moveEvent(legal: LegalActions, move: Move): HandEvent {
  const seat = legal.seat;
  if (move === 'fold') return { type: 'action', seat, action: 'fold' };
  if (move === 'allin') return { type: 'action', seat, action: 'allin' };
  if (move === 'check' || move === 'call') return { type: 'action', seat, action: legal.canCheck ? 'check' : 'call' };
  if (!legal.canBet && !legal.canRaise) return { type: 'action', seat, action: legal.canCheck ? 'check' : 'call' };
  const to = Math.max(move.to, legal.minTo);
  if (to >= legal.maxTo) return { type: 'action', seat, action: 'allin' };
  return { type: 'action', seat, action: legal.canBet ? 'bet' : 'raise', to };
}

/**
 * Everyone before `seat` passes, then `seat` makes his move. null if he isn't to act on this
 * street or the engine refuses the move.
 */
export function actAs(state: TableState, seat: SeatNo, move: Move): HandEvent[] | null {
  const before = passUntil(state, seat);
  if (!before) return null;
  const legal = legalActions(before.state);
  if (!legal) return null;
  const ev = moveEvent(legal, move);
  try {
    apply(before.state, [ev]);
  } catch {
    return null;
  }
  return [...before.events, ev];
}

/** Everyone still to act passes to the end of the street (or of the hand). */
export function restPass(state: TableState): HandEvent[] {
  let st = state;
  const events: HandEvent[] = [];
  for (let i = 0; i < 2 * state.rules.tableSeats && st.phase === 'betting' && st.street === state.street; i++) {
    const legal = legalActions(st);
    if (!legal) break;
    const ev = pass(legal);
    st = applyEvent(st, ev, st.eventsApplied);
    events.push(ev);
  }
  return events;
}

/** Whether anyone has raised the blinds yet. */
export const unopened = (state: TableState) =>
  state.street === 'preflop' && !state.log.some((e) => e.kind === 'action' && e.street === 'preflop' && (e.action === 'raise' || e.action === 'bet'));

export interface Preset {
  label: string;
  /** The street total after the bet or raise, between the smallest raise and all-in. */
  to: Chips;
  allIn: boolean;
}

/** A size as the player can make it: at least the smallest raise, all-in at most. */
function sized(state: TableState, legal: LegalActions, amount: number): { to: Chips; allIn: boolean } {
  const to = Math.min(Math.max(roundChips(state, amount), legal.minTo), legal.maxTo);
  return { to, allIn: to >= legal.maxTo };
}

/**
 * Bet and raise sizes for the player to act: 2 / 3 / 4 / 5 BB to open, ⅓ · ½ · ⅔ · pot to bet
 * after the flop, 2× / 2.5× / 3× / 4× facing a bet or raise. Sizes that come out the same (a
 * short stack) are shown once.
 */
export function sizePresets(state: TableState): Preset[] {
  const legal = legalActions(state);
  if (!legal || !(legal.canBet || legal.canRaise)) return [];
  const bb = state.rules.bb;
  const raw: { label: string; amount: number }[] = legal.canBet
    ? [0.33, 0.5, 0.66, 1].map((f) => ({ label: fractionText(f), amount: potTotal(state) * f }))
    : unopened(state)
      ? [2, 3, 4, 5].map((x) => ({ label: `${x} BB`, amount: x * bb }))
      : [2, 2.5, 3, 4].map((x) => ({ label: `${x}×`, amount: state.currentBet * x }));
  const out: Preset[] = [];
  for (const r of raw) {
    const s = sized(state, legal, r.amount);
    if (!out.some((o) => o.to === s.to)) out.push({ label: r.label, ...s });
  }
  return out;
}

/**
 * Where the amount box starts: your usual open before anyone raised, 3× facing a bet or raise,
 * half the pot for a bet after the flop. − / + move it by a big blind.
 */
export function boxStart(state: TableState, openBB: number): Chips {
  const legal = legalActions(state);
  if (!legal) return 0;
  const amount = legal.canBet ? potTotal(state) / 2 : unopened(state) ? openBB * state.rules.bb : state.currentBet * 3;
  return sized(state, legal, amount).to;
}

/** The amount box after one − / + step: a big blind, kept between the smallest raise and all-in. */
export function boxStep(state: TableState, value: Chips, direction: 1 | -1): Chips {
  const legal = legalActions(state);
  if (!legal) return value;
  return Math.min(Math.max(value + direction * state.rules.bb, legal.minTo), legal.maxTo);
}

/** Hero is out of the hand (folded): his part is over, his result known. */
export const heroOut = (state: TableState, hero: SeatNo | undefined) => hero !== undefined && !!state.seats.find((s) => s.seat === hero)?.folded;

/** Hero's result once it's known: the hand is over, or he folded (what he put in). null while he's still in. */
export function heroNet(state: TableState, hero: SeatNo | undefined): Chips | null {
  if (hero === undefined) return null;
  if (handOver(state)) return state.result?.net[hero] ?? 0;
  const s = state.seats.find((x) => x.seat === hero);
  return s?.folded ? s.stack - s.startStack : null;
}
