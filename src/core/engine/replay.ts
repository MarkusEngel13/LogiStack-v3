/**
 * The rules engine: replays a HandRecord event by event.
 *
 * initialState() seats the players and posts antes, blinds and straddles.
 * applyEvent() returns a new state (the input is never mutated), so the replayer can keep one
 * state per step and the Lab can branch from any of them.
 */

import { type Card, parseCards, rankOf, suitOf, cardToString } from '../cards';
import { describeHand, evaluate } from '../evaluator';
import type { Chips, HandEvent, HandRecord, SeatNo } from '../hand/types';
import { buildPots } from './pots';
import { positionLabels } from './positions';
import type {
  BetAction,
  HandResult,
  LegalActions,
  Pot,
  PotResult,
  SeatState,
  Street,
  TableState,
  Transfer,
} from './state';

export class HandError extends Error {
  constructor(
    message: string,
    /** Index of the offending event, or null for a setup problem. */
    readonly eventIndex: number | null,
  ) {
    super(eventIndex === null ? `Setup: ${message}` : `Event ${eventIndex}: ${message}`);
    this.name = 'HandError';
  }
}

const NEXT_STREET: Record<Street, Street | null> = { preflop: 'flop', flop: 'turn', turn: 'river', river: null };

// ---------------------------------------------------------------------------------------------
// helpers

const inHand = (s: SeatState) => s.dealtIn && !s.folded;
const canAct = (s: SeatState) => s.dealtIn && !s.folded && !s.allIn;

function seatOf(state: TableState, seat: SeatNo): SeatState {
  const s = state.seats.find((x) => x.seat === seat);
  if (!s) throw new Error(`No player in seat ${seat}`);
  return s;
}

/** First seat clockwise after `from` (not including `from`) matching `pred`. */
function nextSeat(state: TableState, from: SeatNo, pred: (s: SeatState) => boolean): SeatState | null {
  const n = state.rules.tableSeats;
  for (let step = 1; step <= n; step++) {
    const seatNo = (from + step) % n;
    const s = state.seats.find((x) => x.seat === seatNo);
    if (s && pred(s)) return s;
  }
  return null;
}

/** Seats matching `pred` clockwise, starting after `from`. */
function seatsFrom(state: TableState, from: SeatNo, pred: (s: SeatState) => boolean): SeatState[] {
  const n = state.rules.tableSeats;
  const out: SeatState[] = [];
  for (let step = 1; step <= n; step++) {
    const s = state.seats.find((x) => x.seat === (from + step) % n);
    if (s && pred(s)) out.push(s);
  }
  return out;
}

function pay(s: SeatState, amount: Chips): Chips {
  const paid = Math.min(amount, s.stack);
  s.stack -= paid;
  s.streetBet += paid;
  s.totalIn += paid;
  if (s.stack === 0) s.allIn = true;
  return paid;
}

const streetBets = (state: TableState) => state.seats.reduce((sum, s) => sum + s.streetBet, 0);
const potTotal = (state: TableState) => state.potInMiddle + streetBets(state);

function knownCards(state: TableState, except?: SeatState): Card[] {
  const cards = [...state.board];
  for (const s of state.seats) if (s !== except && s.cards) cards.push(...s.cards);
  return cards;
}

function assertFresh(state: TableState, cards: Card[], index: number | null, except?: SeatState) {
  const known = new Set(knownCards(state, except));
  const seen = new Set<Card>();
  for (const c of cards) {
    if (known.has(c) || seen.has(c)) throw new HandError(`card ${cardToString(c)} is already in play`, index);
    seen.add(c);
  }
}

// ---------------------------------------------------------------------------------------------
// setup

export function initialState(record: HandRecord): TableState {
  const { table } = record;
  if (!Number.isInteger(table.seats) || table.seats < 2 || table.seats > 10)
    throw new HandError(`table size must be 2-10, got ${table.seats}`, null);
  if (!(table.blinds.bb > 0) || !(table.blinds.sb >= 0))
    throw new HandError('blinds must be positive', null);

  const taken = new Set<number>();
  for (const p of record.players) {
    if (!Number.isInteger(p.seat) || p.seat < 0 || p.seat >= table.seats)
      throw new HandError(`seat ${p.seat} doesn't exist at a ${table.seats}-seat table`, null);
    if (taken.has(p.seat)) throw new HandError(`two players in seat ${p.seat}`, null);
    if (!Number.isInteger(p.stack) || p.stack < 0)
      throw new HandError(`${p.name}: stack must be a whole number of chips`, null);
    taken.add(p.seat);
  }

  const state: TableState = {
    rules: { tableSeats: table.seats, bb: table.blinds.bb, rake: table.rake, sideGames: record.sideGames },
    street: 'preflop',
    phase: 'betting',
    board: [],
    button: record.button,
    seats: [...record.players]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        seat: p.seat,
        name: p.name,
        playerType: p.playerType,
        tags: p.tags ?? [],
        position: '',
        dealtIn: !p.sittingOut && p.stack > 0,
        startStack: p.stack,
        stack: p.stack,
        streetBet: 0,
        totalIn: 0,
        deadIn: 0,
        folded: false,
        allIn: false,
        acted: false,
        matchedLevel: 0,
        cards: null,
        shown: false,
        mucked: false,
        squids: p.squids ?? 0,
        lastAction: null,
      })),
    toAct: null,
    currentBet: 0,
    lastFullRaise: table.blinds.bb,
    needCards: 0,
    potInMiddle: 0,
    log: [],
    eventsApplied: 0,
    result: null,
  };

  // Hole cards from the setup
  for (const p of record.players) {
    if (!p.cards) continue;
    const s = seatOf(state, p.seat);
    let cards: Card[];
    try {
      cards = parseCards(p.cards);
    } catch (e) {
      throw new HandError(`${p.name}: ${(e as Error).message}`, null);
    }
    assertFresh(state, cards, null);
    s.cards = cards;
  }

  const dealt = state.seats.filter((s) => s.dealtIn);
  if (dealt.length < 2) throw new HandError('at least two players must be dealt in', null);
  if (record.button < 0 || record.button >= table.seats)
    throw new HandError(`button seat ${record.button} doesn't exist`, null);

  const buttonDealtIn = dealt.some((s) => s.seat === record.button);
  let sb: SeatState;
  let bb: SeatState;
  if (dealt.length === 2) {
    if (!buttonDealtIn) throw new HandError('heads-up, the button must be one of the two players', null);
    sb = seatOf(state, record.button);
    bb = nextSeat(state, sb.seat, (s) => s.dealtIn)!;
  } else {
    sb = nextSeat(state, record.button, (s) => s.dealtIn)!;
    bb = nextSeat(state, sb.seat, (s) => s.dealtIn)!;
  }

  const order = [sb, ...seatsFrom(state, sb.seat, (s) => s.dealtIn && s !== sb)];
  const labels = positionLabels(order.map((s) => s.seat), buttonDealtIn);
  for (const s of state.seats) s.position = labels.get(s.seat) ?? '';

  // Antes (dead money)
  const post = (s: SeatState, kind: 'ante' | 'sb' | 'bb' | 'straddle', amount: Chips) => {
    if (kind === 'ante') {
      const paid = Math.min(amount, s.stack);
      s.stack -= paid;
      s.totalIn += paid;
      s.deadIn += paid;
      if (s.stack === 0) s.allIn = true;
      state.potInMiddle += paid;
      state.log.push({ kind: 'post', event: null, seat: s.seat, post: kind, amount: paid, allIn: s.allIn });
    } else {
      const paid = pay(s, amount - s.streetBet);
      s.lastAction = { action: 'post', to: s.streetBet, allIn: s.allIn };
      state.log.push({ kind: 'post', event: null, seat: s.seat, post: kind, amount: paid, allIn: s.allIn });
    }
  };

  if (table.ante && table.ante.amount > 0) {
    if (table.ante.kind === 'each') for (const s of order) post(s, 'ante', table.ante.amount);
    else post(bb, 'ante', table.ante.amount);
  }
  post(sb, 'sb', table.blinds.sb);
  post(bb, 'bb', table.blinds.bb);

  let lastBlind = bb;
  let level = table.blinds.bb;
  for (const st of record.straddles ?? []) {
    const s = state.seats.find((x) => x.seat === st.seat);
    if (!s || !s.dealtIn) throw new HandError(`straddle from seat ${st.seat}, which isn't dealt in`, null);
    if (s.allIn) throw new HandError(`seat ${st.seat} is already all-in and can't straddle`, null);
    if (st.amount <= level) throw new HandError(`a straddle must be bigger than ${level}`, null);
    post(s, 'straddle', st.amount);
    lastBlind = s;
    level = st.amount;
  }

  // The biggest blind is the bet to call, and the first raise must add at least that much again.
  state.currentBet = level;
  state.lastFullRaise = level;

  advanceAfter(state, lastBlind.seat, null);
  return state;
}

// ---------------------------------------------------------------------------------------------
// betting

function canRaiseNow(state: TableState, s: SeatState): boolean {
  if (s.stack <= state.currentBet - s.streetBet) return false; // can only call (or less)
  const opponentsWhoCanRespond = state.seats.some((o) => o !== s && canAct(o));
  if (!opponentsWhoCanRespond) return false;
  // A short all-in raise does not re-open the betting for a player who already acted.
  return !s.acted || state.currentBet - s.matchedLevel >= state.lastFullRaise;
}

export function legalActions(state: TableState): LegalActions | null {
  if (state.phase !== 'betting' || state.toAct === null) return null;
  const s = seatOf(state, state.toAct);
  const owed = state.currentBet - s.streetBet;
  const maxTo = s.streetBet + s.stack;
  const canBet = state.currentBet === 0 && s.stack > 0 && state.seats.some((o) => o !== s && canAct(o));
  const canRaise = state.currentBet > 0 && canRaiseNow(state, s);
  const minTo = canBet
    ? Math.min(state.rules.bb, maxTo)
    : Math.min(state.currentBet + state.lastFullRaise, maxTo);
  return {
    seat: s.seat,
    toCall: Math.min(Math.max(owed, 0), s.stack),
    canFold: true,
    canCheck: owed <= 0,
    canCall: owed > 0,
    canBet,
    canRaise,
    minTo,
    maxTo,
  };
}

function roundComplete(state: TableState): boolean {
  const live = state.seats.filter(inHand);
  if (live.length <= 1) return true;
  const actors = live.filter((s) => !s.allIn);
  if (actors.length === 0) return true;
  if (actors.length === 1) return actors[0]!.streetBet >= state.currentBet;
  return actors.every((s) => s.acted && s.streetBet === state.currentBet);
}

const needsAction = (state: TableState) => (s: SeatState) =>
  canAct(s) && !(s.acted && s.streetBet >= state.currentBet);

function applyAction(state: TableState, ev: Extract<HandEvent, { type: 'action' }>, index: number) {
  if (state.phase !== 'betting') throw new HandError(`no betting now (${state.phase})`, index);
  if (ev.seat !== state.toAct) {
    const turn = state.toAct === null ? 'nobody' : `seat ${state.toAct}`;
    throw new HandError(`seat ${ev.seat} acted, but it's ${turn}'s turn`, index);
  }
  const s = seatOf(state, ev.seat);
  const owed = state.currentBet - s.streetBet;
  const maxTo = s.streetBet + s.stack;

  let action: BetAction;
  let to = ev.to ?? 0;
  if (ev.action === 'allin') {
    to = maxTo;
    action = state.currentBet === 0 ? 'bet' : to <= state.currentBet ? 'call' : 'raise';
  } else {
    action = ev.action;
  }

  const before = s.totalIn;
  switch (action) {
    case 'fold':
      s.folded = true;
      break;
    case 'check':
      if (owed > 0) throw new HandError(`seat ${s.seat} can't check facing a bet of ${state.currentBet}`, index);
      break;
    case 'call':
      if (owed <= 0) throw new HandError(`seat ${s.seat} has nothing to call; that's a check`, index);
      pay(s, owed);
      break;
    case 'bet': {
      if (state.currentBet > 0) throw new HandError(`there's already a bet; seat ${s.seat} must raise`, index);
      if (!Number.isInteger(to) || to <= 0) throw new HandError('a bet needs a whole-chip "to" amount', index);
      if (to > maxTo) throw new HandError(`seat ${s.seat} bets ${to} but only has ${maxTo}`, index);
      if (to < state.rules.bb && to < maxTo)
        throw new HandError(`minimum bet is ${state.rules.bb} unless all-in`, index);
      pay(s, to - s.streetBet);
      if (to >= state.rules.bb) state.lastFullRaise = to;
      state.currentBet = to;
      break;
    }
    case 'raise': {
      if (state.currentBet === 0) throw new HandError(`nothing to raise; seat ${s.seat} must bet`, index);
      if (!Number.isInteger(to) || to <= state.currentBet)
        throw new HandError(`a raise must go above ${state.currentBet}`, index);
      if (to > maxTo) throw new HandError(`seat ${s.seat} raises to ${to} but only has ${maxTo}`, index);
      if (!canRaiseNow(state, s))
        throw new HandError(`seat ${s.seat} may only call or fold (betting was not re-opened)`, index);
      const increment = to - state.currentBet;
      if (increment < state.lastFullRaise && to < maxTo)
        throw new HandError(`minimum raise is to ${state.currentBet + state.lastFullRaise} unless all-in`, index);
      pay(s, to - s.streetBet);
      if (increment >= state.lastFullRaise) state.lastFullRaise = increment;
      state.currentBet = to;
      break;
    }
  }

  s.acted = true;
  s.matchedLevel = state.currentBet;
  const shownTo = action === 'fold' || action === 'check' ? 0 : s.streetBet;
  s.lastAction = { action, to: shownTo, allIn: s.allIn };
  state.log.push({
    kind: 'action',
    event: index,
    street: state.street,
    seat: s.seat,
    action,
    to: shownTo,
    added: s.totalIn - before,
    allIn: s.allIn && action !== 'fold',
    potAfter: potTotal(state),
  });

  advanceAfter(state, s.seat, index);
}

/** After a post or an action: hand over, street over, or the next player's turn. */
function advanceAfter(state: TableState, lastSeat: SeatNo, index: number | null) {
  if (state.seats.filter(inHand).length === 1) {
    closeStreet(state, index);
    state.phase = 'complete';
    state.toAct = null;
    settle(state);
    return;
  }
  if (roundComplete(state)) {
    endStreet(state, index);
    return;
  }
  const next = nextSeat(state, lastSeat, needsAction(state));
  state.toAct = next ? next.seat : null;
  if (!next) endStreet(state, index);
}

/** Returns an uncalled bet and moves the street's bets into the middle. */
function closeStreet(state: TableState, index: number | null) {
  const byBet = [...state.seats].sort((a, b) => b.streetBet - a.streetBet);
  const top = byBet[0]!;
  const second = byBet[1]?.streetBet ?? 0;
  if (top.streetBet > second) {
    const refund = top.streetBet - second;
    top.stack += refund;
    top.streetBet -= refund;
    top.totalIn -= refund;
    top.allIn = top.stack === 0;
    state.log.push({ kind: 'refund', event: index, seat: top.seat, amount: refund });
  }
  for (const s of state.seats) {
    state.potInMiddle += s.streetBet;
    s.streetBet = 0;
    s.acted = false;
    s.matchedLevel = 0;
  }
  state.currentBet = 0;
  state.lastFullRaise = state.rules.bb;
}

function endStreet(state: TableState, index: number | null) {
  closeStreet(state, index);
  state.toAct = null;
  if (state.street === 'river') {
    goToShowdown(state);
    return;
  }
  state.phase = 'dealing';
  state.needCards = state.street === 'preflop' ? 3 : 1;
}

function goToShowdown(state: TableState) {
  state.phase = 'showdown';
  state.toAct = null;
  state.needCards = 0;
  settle(state);
}

// ---------------------------------------------------------------------------------------------
// board, show, muck

function applyBoard(state: TableState, ev: Extract<HandEvent, { type: 'board' }>, index: number) {
  if (state.phase !== 'dealing') throw new HandError(`board cards can't come now (${state.phase})`, index);
  if (ev.cards.length !== state.needCards)
    throw new HandError(`expected ${state.needCards} board card(s), got ${ev.cards.length}`, index);
  let cards: Card[];
  try {
    cards = parseCards(ev.cards);
  } catch (e) {
    throw new HandError((e as Error).message, index);
  }
  assertFresh(state, cards, index);

  state.board.push(...cards);
  state.street = NEXT_STREET[state.street]!;
  state.needCards = 0;
  state.log.push({ kind: 'board', event: index, street: state.street, cards });
  for (const s of state.seats) if (inHand(s)) s.lastAction = null;

  if (state.seats.filter(canAct).length >= 2) {
    state.phase = 'betting';
    state.toAct = nextSeat(state, state.button, canAct)!.seat;
  } else if (state.street === 'river') {
    goToShowdown(state);
  } else {
    state.phase = 'dealing'; // all-in: run the board out
    state.needCards = 1;
  }
}

function applyShow(state: TableState, ev: Extract<HandEvent, { type: 'show' }>, index: number) {
  const s = seatOf(state, ev.seat);
  if (!s.dealtIn) throw new HandError(`seat ${s.seat} wasn't dealt in`, index);
  if (ev.cards) {
    let cards: Card[];
    try {
      cards = parseCards(ev.cards);
    } catch (e) {
      throw new HandError((e as Error).message, index);
    }
    if (s.cards && !(cards.length === 2 && s.cards.every((c) => cards.includes(c))))
      throw new HandError(`seat ${s.seat} shows different cards than the setup says`, index);
    if (!s.cards) assertFresh(state, cards, index, s);
    s.cards = cards;
  }
  if (!s.cards) throw new HandError(`seat ${s.seat} shows, but their cards are unknown`, index);
  s.shown = true;
  s.mucked = false;
  state.log.push({ kind: 'show', event: index, seat: s.seat, cards: s.cards });
  if (state.phase === 'showdown' || state.phase === 'complete') settle(state);
}

function applyMuck(state: TableState, ev: Extract<HandEvent, { type: 'muck' }>, index: number) {
  if (state.phase !== 'showdown') throw new HandError('players can only muck at showdown', index);
  const s = seatOf(state, ev.seat);
  if (!inHand(s)) throw new HandError(`seat ${s.seat} isn't in the hand`, index);
  s.mucked = true;
  s.shown = false;
  state.log.push({ kind: 'muck', event: index, seat: s.seat });
  settle(state);
}

// ---------------------------------------------------------------------------------------------
// settlement: pots, rake, winners, side games

const isSevenDeuce = (cards: Card[] | null, suitedCounts: boolean) => {
  if (!cards || cards.length !== 2) return false;
  const ranks = cards.map(rankOf).sort((a, b) => a - b);
  if (ranks[0] !== 0 || ranks[1] !== 5) return false; // 2 and 7
  return suitedCounts || suitOf(cards[0]!) !== suitOf(cards[1]!);
};

/** Pots built from everything put in so far; dead money (antes) joins the main pot. */
export function currentPots(state: TableState, includeStreetBets = true): Pot[] {
  const pots = buildPots(
    state.seats
      .filter((s) => s.dealtIn)
      .map((s) => ({
        seat: s.seat,
        amount: s.totalIn - s.deadIn - (includeStreetBets ? 0 : s.streetBet),
        live: inHand(s) && !s.mucked,
      })),
  );
  const dead = state.seats.reduce((sum, s) => sum + s.deadIn, 0);
  if (dead > 0) {
    if (pots[0]) pots[0].amount += dead;
    else pots.push({ amount: dead, eligible: state.seats.filter(inHand).map((s) => s.seat) });
  }
  return pots;
}

function settle(state: TableState) {
  const showdown = state.phase === 'showdown';
  const pots = currentPots(state);
  const total = pots.reduce((sum, p) => sum + p.amount, 0);

  // Rake comes out of the main pot first.
  let rake = 0;
  const rr = state.rules.rake;
  if (rr && !(rr.noFlopNoDrop && state.board.length < 3)) {
    rake = Math.floor(total * rr.percent + 1e-9); // 1e-9: 100 * 0.29 is 28.999... in floating point
    if (rr.cap > 0) rake = Math.min(rake, rr.cap);
  }
  let rakeLeft = rake;

  const visible = (s: SeatState) => s.cards !== null && !s.mucked && (s.shown || (showdown && inHand(s)));
  const hands: HandResult['hands'] = [];
  const scores = new Map<SeatNo, number>();
  if (state.board.length === 5) {
    for (const s of state.seats) {
      if (!visible(s)) continue;
      const score = evaluate([...s.cards!, ...state.board]);
      scores.set(s.seat, score);
      hands.push({ seat: s.seat, score, description: describeHand(score) });
    }
  }

  // Odd chips go to the first winner clockwise from the button.
  const clockwise = seatsFrom(state, state.button, () => true).map((s) => s.seat);

  let resolved = true;
  const potResults: PotResult[] = pots.map((pot) => {
    const take = Math.min(rakeLeft, pot.amount);
    rakeLeft -= take;
    const amount = pot.amount - take;

    let winners: SeatNo[] | null;
    let winningHand: string | undefined;
    if (pot.eligible.length <= 1) {
      winners = pot.eligible.length === 1 ? [...pot.eligible] : null;
    } else if (!showdown || pot.eligible.some((seat) => !scores.has(seat))) {
      winners = null;
    } else {
      const best = Math.max(...pot.eligible.map((seat) => scores.get(seat)!));
      winners = pot.eligible.filter((seat) => scores.get(seat) === best);
      winningHand = describeHand(best);
    }
    if (!winners || winners.length === 0) {
      resolved = false;
      return { ...pot, winners: null, shares: {} };
    }

    const shares: Record<number, Chips> = {};
    const base = Math.floor(amount / winners.length);
    let odd = amount - base * winners.length;
    for (const seat of clockwise.filter((x) => winners!.includes(x))) {
      shares[seat] = base + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
    }
    return { ...pot, winners, shares, winningHand };
  });

  const finalStacks: Record<number, Chips> = {};
  for (const s of state.seats) finalStacks[s.seat] = s.stack;
  for (const p of potResults) for (const [seat, amt] of Object.entries(p.shares)) finalStacks[+seat]! += amt;

  const transfer = (list: Transfer[], t: Transfer) => {
    const amount = Math.min(t.amount, finalStacks[t.from]!);
    if (amount <= 0) return;
    finalStacks[t.from]! -= amount;
    finalStacks[t.to]! += amount;
    list.push({ ...t, amount });
  };

  // 7-2 game
  const bounties: Transfer[] = [];
  const sd = state.rules.sideGames?.sevenDeuce;
  const mainPot = potResults[0];
  if (sd && resolved && mainPot?.winners && (showdown || !sd.showdownOnly)) {
    for (const winner of mainPot.winners) {
      const w = seatOf(state, winner);
      if (!visible(w) || !isSevenDeuce(w.cards, sd.suitedCounts)) continue;
      const payers = state.seats.filter((s) => s !== w && (sd.payers === 'all-seated' || s.dealtIn));
      for (const p of payers) transfer(bounties, { from: p.seat, to: winner, amount: sd.bounty, reason: 'seven-deuce' });
    }
  }

  // Squid game
  let squid: HandResult['squid'] = null;
  const sq = state.rules.sideGames?.squid;
  if (sq && resolved) {
    const potWinners = new Set(potResults.flatMap((p) => p.winners ?? []));
    const awarded = [...potWinners].filter((seat) => seatOf(state, seat).squids === 0).sort((a, b) => a - b);
    const playing = state.seats.filter((s) => s.dealtIn || s.squids > 0);
    const count = (s: SeatState) => s.squids + (awarded.includes(s.seat) ? 1 : 0);
    const without = playing.filter((s) => count(s) === 0);
    const payout: Transfer[] = [];
    if (without.length === 1 && playing.length > 1) {
      const loser = without[0]!;
      for (const h of playing.filter((s) => count(s) > 0))
        transfer(payout, { from: loser.seat, to: h.seat, amount: sq.value * count(h), reason: 'squid' });
    }
    squid = { awarded, payout };
  }

  const net: Record<number, Chips> = {};
  for (const s of state.seats) net[s.seat] = finalStacks[s.seat]! - s.startStack;

  state.result = { showdown, rake, pots: potResults, hands, bounties, squid, resolved, net, finalStacks };
}

// ---------------------------------------------------------------------------------------------
// public API

export function applyEvent(prev: TableState, event: HandEvent, index: number): TableState {
  const state = structuredClone(prev);
  switch (event.type) {
    case 'action':
      applyAction(state, event, index);
      break;
    case 'board':
      applyBoard(state, event, index);
      break;
    case 'show':
      applyShow(state, event, index);
      break;
    case 'muck':
      applyMuck(state, event, index);
      break;
    default:
      throw new HandError(`unknown event type "${(event as { type: string }).type}"`, index);
  }
  state.eventsApplied = index + 1;
  return state;
}

/** State after the first `upto` events (default: all of them). */
export function replay(record: HandRecord, upto = record.events.length): TableState {
  let state = initialState(record);
  for (let i = 0; i < upto; i++) state = applyEvent(state, record.events[i]!, i);
  return state;
}

/** One state per step: [after the blinds, after event 0, after event 1, ...]. */
export function replaySteps(record: HandRecord): TableState[] {
  const steps = [initialState(record)];
  record.events.forEach((ev, i) => steps.push(applyEvent(steps[i]!, ev, i)));
  return steps;
}

/** Pot odds for the player to act: e.g. { ratio: 1.61, percent: 38.3 } when calling 85 into 137. */
export function potOdds(state: TableState): { pot: Chips; toCall: Chips; ratio: number; percent: number } | null {
  const legal = legalActions(state);
  if (!legal || legal.toCall <= 0) return null;
  const pot = potTotal(state);
  return { pot, toCall: legal.toCall, ratio: pot / legal.toCall, percent: (100 * legal.toCall) / (pot + legal.toCall) };
}

export { potTotal };
