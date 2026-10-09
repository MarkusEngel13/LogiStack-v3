/**
 * Quick hand entry for the live table: everything that turns a few taps into real hand events.
 *
 * - Cards: a hand class from the 13x13 grid ("AKs") becomes two real cards, suits picked so they
 *   don't clash with any card already in play. A board is entered as ranks plus a texture
 *   (rainbow, two-tone, monotone); the turn and river as a rank plus "blank" or "flush card".
 *   Exact suits can be fixed later by cycling a card's suit.
 * - Lines: a whole street in one tap ("Fish bets ½ · you call"). Each line is a small policy
 *   (who checks, who bets, how the rest answer) played through the engine from the current state,
 *   so it is always legal and the pot, stacks and all-ins come out right. Lines that the engine
 *   would play differently from their label (someone can't raise, a player is all-in) are dropped.
 */

import { RANK_CHARS, rankOf, suitOf, cardToString, prettyCard, type Card } from '../cards';
import { applyEvent, legalActions, potTotal } from '../engine/replay';
import type { LegalActions, SeatState, TableState } from '../engine/state';
import type { HandEvent, SeatNo } from '../hand/types';
import { cellKind, cellRanks } from '../ranges/hands';

// ---- cards -------------------------------------------------------------------------------------

const card = (rank: number, suit: number): Card => suit * 13 + rank;

/** Every card already in play: the board and all known hole cards. */
export function usedCards(state: TableState): Set<Card> {
  const out = new Set<Card>(state.board);
  for (const s of state.seats) for (const c of s.cards ?? []) out.add(c);
  return out;
}

/**
 * Two real cards for a grid cell ("AKs" = cell), avoiding `used`. Suited hands try spades first,
 * offsuit and pairs spades + hearts first. null if every combo of the cell is blocked.
 */
export function cellCards(cell: number, used: ReadonlySet<Card>): [Card, Card] | null {
  const [hi, lo] = cellRanks(cell);
  const kind = cellKind(cell);
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      if (kind === 'suited' ? a !== b : kind === 'pair' ? b <= a : a === b) continue;
      const x = card(hi, a);
      const y = card(lo, b);
      if (!used.has(x) && !used.has(y)) return [x, y];
    }
  }
  return null;
}

export type Texture = 'rainbow' | 'twotone' | 'mono';

/**
 * A flop from three ranks and a texture. Two-tone puts the two highest different ranks in one
 * suit. `drawSuit`: the suit to use for the suited cards (your flush draw); otherwise suits you
 * hold are avoided for them, so a plain "two-tone" doesn't hand you a draw by accident.
 * Falls back to the closest texture the ranks allow (a paired flop can't be monotone).
 */
export function flopCards(
  ranks: readonly number[],
  texture: Texture,
  used: ReadonlySet<Card>,
  heroSuits: readonly number[] = [],
  drawSuit?: number,
): Card[] | null {
  const order = [...ranks].sort((a, b) => b - a);
  // groups: same number = same suit
  const groupsFor = (t: Texture): number[] | null => {
    if (t === 'rainbow') return [0, 1, 2];
    if (t === 'mono') return new Set(order).size === 3 ? [0, 0, 0] : null;
    // two-tone: two different ranks share a suit
    if (order[0] !== order[1]) return [0, 0, 1];
    if (order[1] !== order[2]) return [1, 0, 0];
    return null; // trips: can't be two-tone
  };
  const tries: Texture[] = texture === 'mono' ? ['mono', 'twotone', 'rainbow'] : texture === 'twotone' ? ['twotone', 'rainbow'] : ['rainbow'];
  for (const t of tries) {
    const groups = groupsFor(t);
    if (!groups) continue;
    const nGroups = Math.max(...groups) + 1;
    let best: { cards: Card[]; score: number } | null = null;
    const suits = [0, 0, 0];
    const assign = (g: number) => {
      if (g === nGroups) {
        const cards = order.map((r, i) => card(r, suits[groups[i]!]!));
        if (new Set(cards).size !== 3 || cards.some((c) => used.has(c))) return;
        const main = suits[0]!;
        const size0 = groups.filter((x) => x === 0).length;
        let score = 0;
        if (size0 >= 2) {
          if (drawSuit !== undefined) score += main === drawSuit ? 10 : 0;
          else score -= heroSuits.includes(main) ? 5 : 0;
        }
        score -= suits.slice(0, nGroups).reduce((a, s) => a + s, 0) * 0.01; // stable: lowest suits first
        if (!best || score > best.score) best = { cards, score };
        return;
      }
      for (let s = 0; s < 4; s++) {
        if (suits.slice(0, g).includes(s)) continue;
        suits[g] = s;
        assign(g + 1);
      }
    };
    assign(0);
    if (best) return (best as { cards: Card[] }).cards;
  }
  return null;
}

/**
 * The turn or river from a rank. 'blank' = a suit that doesn't add to a flush (the fewest of it
 * on the board, not yours if that's a tie); 'flush' = the suit the board has most of (yours on a tie).
 */
export function streetCard(rank: number, kind: 'blank' | 'flush', board: readonly Card[], used: ReadonlySet<Card>, heroSuits: readonly number[] = []): Card | null {
  const count = (s: number) => board.filter((c) => suitOf(c) === s).length;
  let best: { c: Card; score: number } | null = null;
  for (let s = 0; s < 4; s++) {
    const c = card(rank, s);
    if (used.has(c)) continue;
    const mine = heroSuits.includes(s) ? 1 : 0;
    const score = kind === 'blank' ? -count(s) * 10 - mine - s * 0.01 : count(s) * 10 + mine - s * 0.01;
    if (!best || score > best.score) best = { c, score };
  }
  return best ? best.c : null;
}

/** The same card in the next suit that's free (for fixing a guessed suit with one tap). */
export function nextSuit(c: Card, used: ReadonlySet<Card>): Card {
  for (let step = 1; step < 4; step++) {
    const x = card(rankOf(c), (suitOf(c) + step) % 4);
    if (!used.has(x)) return x;
  }
  return c;
}

export const rankChar = (rank: number) => RANK_CHARS[rank]!;

// ---- lines -------------------------------------------------------------------------------------

export interface Line {
  id: string;
  label: string;
  events: HandEvent[];
}

type Intent = 'fold' | 'check' | 'call' | { to: number };

/** Rounds an amount to the table's chip unit (a fifth of the big blind: 5 cents at 10/25). */
export function roundChips(state: TableState, amount: number): number {
  const unit = Math.max(1, Math.round(state.rules.bb / 5));
  return Math.max(unit, Math.round(amount / unit) * unit);
}

function toEvent(seat: SeatNo, intent: Intent, legal: LegalActions): HandEvent {
  if (intent === 'fold') return { type: 'action', seat, action: 'fold' };
  if (intent === 'check' || intent === 'call') {
    if (legal.canCheck) return { type: 'action', seat, action: 'check' };
    return legal.toCall > 0 ? { type: 'action', seat, action: 'call' } : { type: 'action', seat, action: 'check' };
  }
  const can = legal.canBet || legal.canRaise;
  if (!can) return legal.canCheck ? { type: 'action', seat, action: 'check' } : { type: 'action', seat, action: 'call' };
  const to = Math.max(intent.to, legal.minTo);
  if (to >= legal.maxTo) return { type: 'action', seat, action: 'allin' };
  return { type: 'action', seat, action: legal.canBet ? 'bet' : 'raise', to };
}

/** A bet or raise of a given size, as an event for the player to act (the action pad uses this too). */
export function sizedAction(state: TableState, to: number): HandEvent | null {
  const legal = legalActions(state);
  if (!legal) return null;
  return toEvent(legal.seat, { to: roundChips(state, to) }, legal);
}

type Policy = (s: SeatState, state: TableState, legal: LegalActions) => Intent;

/** Plays the rest of the current street with a policy. null if the engine refuses something. */
function playStreet(start: TableState, policy: Policy): { events: HandEvent[]; end: TableState } | null {
  let state = start;
  const events: HandEvent[] = [];
  const street = start.street;
  try {
    for (let i = 0; i < 40 && state.phase === 'betting' && state.street === street; i++) {
      const legal = legalActions(state);
      if (!legal) break;
      const s = state.seats.find((x) => x.seat === legal.seat)!;
      const ev = toEvent(s.seat, policy(s, state, legal), legal);
      state = applyEvent(state, ev, state.eventsApplied);
      events.push(ev);
    }
  } catch {
    return null;
  }
  return events.length ? { events, end: state } : null;
}

/** Steps clockwise from seat `from` to seat `to` (0 = the same seat). */
export const clockwise = (state: TableState, from: SeatNo, to: SeatNo) => (((to - from) % state.rules.tableSeats) + state.rules.tableSeats) % state.rules.tableSeats;

const live = (state: TableState) => state.seats.filter((s) => s.dealtIn && !s.folded);
const actionsOf = (events: HandEvent[], seat: SeatNo) => events.filter((e) => e.type === 'action' && e.seat === seat);
const raised = (events: HandEvent[], seat: SeatNo) =>
  actionsOf(events, seat).some((e) => e.type === 'action' && (e.action === 'bet' || e.action === 'raise' || e.action === 'allin'));

export interface Names {
  hero?: SeatNo;
  name: (seat: SeatNo) => string;
}

/** "You" / a name, and the verb to go with it. */
const who = (n: Names, seat: SeatNo) => (seat === n.hero ? 'You' : n.name(seat));
const verb = (n: Names, seat: SeatNo, v: string) => (seat === n.hero ? v : `${v}${v.endsWith('s') ? 'es' : 's'}`);
const subject = (n: Names, seat: SeatNo, v: string) => `${who(n, seat)} ${verb(n, seat, v)}`;

function answerText(n: Names, seats: SeatNo[], v: 'call' | 'fold'): string {
  if (seats.length === 0) return '';
  if (seats.length === 1) return subject(n, seats[0]!, v).replace(/^You/, 'you');
  return v === 'call' ? `${seats.length} call` : 'all fold';
}

const bbText = (x: number) => `${Math.round(x * 10) / 10} BB`;

/** Whether anyone has raised the blinds yet. */
const unopened = (state: TableState) => state.currentBet <= state.blindLevel && !state.log.some((e) => e.kind === 'action' && e.street === 'preflop' && (e.action === 'raise' || e.action === 'bet'));

/**
 * Preflop lines for the players who see the flop (`inPot`, Hero among them), from the current
 * state: limped, someone opens and the rest call, and (heads-up) open / 3-bet / call or fold.
 * Everyone else folds. `openBB` is the usual open; each limper adds one big blind to it.
 */
export function preflopLines(state: TableState, inPot: readonly SeatNo[], openBB: number, n: Names): Line[] {
  if (state.phase !== 'betting' || state.street !== 'preflop' || inPot.length === 0) return [];
  const bb = state.rules.bb;
  const P = new Set(inPot);
  const out: Line[] = [];
  const check = (r: ReturnType<typeof playStreet>, expect: SeatNo[]) => {
    if (!r) return null;
    const left = live(r.end).map((s) => s.seat).sort((a, b) => a - b);
    const want = [...expect].sort((a, b) => a - b);
    return left.length === want.length && left.every((x, i) => x === want[i]) ? r : null;
  };

  // limped: nobody raises
  if (unopened(state) && P.size >= 2) {
    const r = check(playStreet(state, (s) => (P.has(s.seat) ? 'call' : 'fold')), [...P]);
    if (r) out.push({ id: 'limp', label: `Limped · ${P.size}-way`, events: r.events });
  }

  // X opens, the rest of P call
  if (unopened(state)) {
    for (const x of inPot) {
      let openTo = 0;
      let limped = false;
      const r = check(
        playStreet(state, (s, st) => {
          if (!P.has(s.seat)) return 'fold';
          if (s.seat === x && unopened(st)) {
            const limpers = st.seats.filter((o) => o.seat !== x && o.dealtIn && o.lastAction?.action === 'call').length;
            limped = limpers > 0;
            openTo = roundChips(st, (openBB + limpers) * bb);
            return { to: openTo };
          }
          return 'call';
        }),
        [...P],
      );
      if (!r || !raised(r.events, x)) continue;
      const rest = inPot.filter((s) => s !== x);
      const tail = rest.length ? answerText(n, rest, 'call') : 'all fold';
      out.push({ id: `open-${x}`, label: `${subject(n, x, limped ? 'raise' : 'open')} ${bbText(openTo / bb)} · ${tail}`, events: r.events });
    }
  }

  // heads-up: X opens, Y 3-bets, X calls / folds
  if (unopened(state) && P.size === 2) {
    const [a, b] = inPot as [SeatNo, SeatNo];
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      for (const xAnswer of ['call', 'fold'] as const) {
        let openTo = 0;
        const r = playStreet(state, (s, st) => {
          if (!P.has(s.seat)) return 'fold';
          if (s.seat === x && unopened(st)) {
            openTo = roundChips(st, openBB * bb);
            return { to: openTo };
          }
          if (s.seat === y && st.currentBet === openTo) return { to: roundChips(st, openTo * 3) };
          if (s.seat === x) return xAnswer;
          return 'call';
        });
        const expect = xAnswer === 'call' ? [a, b] : [y];
        const ok = check(r, expect);
        if (!ok || !raised(ok.events, x) || !raised(ok.events, y)) continue;
        const label = `${subject(n, x, 'open')} · ${who(n, y) === 'You' ? 'you 3-bet' : `${n.name(y)} 3-bets`} · ${answerText(n, [x], xAnswer)}`;
        out.push({ id: `3b-${x}-${y}-${xAnswer}`, label, events: ok.events });
      }
    }
  }
  return out;
}

const FRACTION_TEXT: Record<string, string> = { '0.33': '⅓', '0.5': '½', '0.66': '⅔', '0.75': '¾', '1': 'pot' };
export const fractionText = (f: number) => FRACTION_TEXT[String(f)] ?? `${Math.round(f * 100)}%`;

/** A bet's share of the pot as the nearest usual size ("½") when it's within a few percent of one. */
function sizeText(f: number): string {
  const near = [0.33, 0.5, 0.66, 0.75, 1].find((x) => Math.abs(x - f) <= 0.04);
  return near !== undefined ? fractionText(near) : `${Math.round(f * 100)}%`;
}

/**
 * Lines for a street after the flop, from the current state: checked through; each player bets
 * `frac` of the pot and the others all call or all fold; heads-up also bet / raise (3x) / call
 * or fold; three-way, bet and one of the two calls.
 */
export function postflopLines(state: TableState, frac: number, n: Names): Line[] {
  if (state.phase !== 'betting' || state.street === 'preflop' || state.currentBet > 0) return [];
  const actors = live(state).filter((s) => !s.allIn).map((s) => s.seat);
  // acting order from the player to act
  const first = state.toAct!;
  const ordered = [...actors].sort((a, b) => clockwise(state, first, a) - clockwise(state, first, b));
  const others = live(state).map((s) => s.seat);
  const out: Line[] = [];
  const f = fractionText(frac);

  const checked = playStreet(state, () => 'check');
  if (checked) out.push({ id: 'check', label: 'Checked through', events: checked.events });

  const bettingLine = (b: SeatNo, answer: (s: SeatNo) => 'call' | 'fold', raiser?: SeatNo, bAnswer?: 'call' | 'fold') => {
    let betTo = 0;
    return playStreet(state, (s, st) => {
      if (st.currentBet === 0) {
        if (s.seat !== b) return 'check';
        betTo = roundChips(st, potTotal(st) * frac);
        return { to: betTo };
      }
      if (raiser !== undefined && s.seat === raiser && st.currentBet === betTo) return { to: roundChips(st, betTo * 3) };
      if (s.seat === b) return bAnswer ?? 'call';
      return answer(s.seat);
    });
  };

  for (const b of ordered) {
    const rest = others.filter((s) => s !== b);
    for (const ans of ['call', 'fold'] as const) {
      const r = bettingLine(b, () => ans);
      if (!r || !raised(r.events, b)) continue;
      out.push({ id: `bet-${b}-${ans}`, label: `${subject(n, b, 'bet')} ${f} · ${answerText(n, rest, ans)}`, events: r.events });
    }
    if (rest.length === 1 && actors.length === 2) {
      const y = rest[0]!;
      for (const bAns of ['call', 'fold'] as const) {
        const r = bettingLine(b, () => 'call', y, bAns);
        if (!r || !raised(r.events, y)) continue;
        out.push({ id: `raise-${b}-${y}-${bAns}`, label: `${subject(n, b, 'bet')} ${f} · ${who(n, y) === 'You' ? 'you raise' : `${n.name(y)} raises`} · ${answerText(n, [b], bAns)}`, events: r.events });
      }
    }
    if (rest.length === 2) {
      for (const c of rest) {
        const r = bettingLine(b, (s) => (s === c ? 'call' : 'fold'));
        if (!r || !raised(r.events, b)) continue;
        const folder = rest.find((s) => s !== c)!;
        out.push({ id: `bet-${b}-${c}`, label: `${subject(n, b, 'bet')} ${f} · ${answerText(n, [c], 'call')}, ${answerText(n, [folder], 'fold')}`, events: r.events });
      }
    }
  }
  return out;
}

// ---- where the hand is ------------------------------------------------------------------------

export const handOver = (state: TableState) => state.phase === 'complete' || (state.phase === 'showdown' && !!state.result?.resolved);

/** Players at showdown whose cards are still needed (not known, not shown, not mucked). */
export function showdownUnknown(state: TableState): SeatState[] {
  if (state.phase !== 'showdown') return [];
  return state.seats.filter((s) => s.dealtIn && !s.folded && !s.mucked && !s.cards);
}

/**
 * The hand in one short line per street, for the live screen:
 * "CO 3 BB · BB call | K♠7♥2♦ BB x · CO ½ · BB call | …". Folds before the flop are left out.
 */
export function handSummary(state: TableState): string[] {
  const pos = (seat: SeatNo) => state.seats.find((s) => s.seat === seat)?.position || `S${seat + 1}`;
  const bb = state.rules.bb;
  const parts: string[] = [];
  let cur: string[] = [];
  let street = 'preflop';
  let boardText = '';
  let preRaises = 0;
  let limps = 0;
  const flush = () => {
    if (cur.length || boardText) parts.push([boardText, cur.join(' · ')].filter(Boolean).join('  '));
    cur = [];
    boardText = '';
  };
  for (const e of state.log) {
    if (e.kind === 'board') {
      flush();
      street = e.street;
      boardText = e.cards.map(prettyCard).join('');
    } else if (e.kind === 'action') {
      if (e.action === 'fold' && street === 'preflop') continue;
      const before = e.potAfter - e.added;
      const size =
        e.action === 'bet' || e.action === 'raise'
          ? street === 'preflop'
            ? bbText(e.to / bb)
            : e.action === 'bet' && before > 0
              ? sizeText(e.added / before)
              : `to ${bbText(e.to / bb)}`
          : '';
      if (street === 'preflop' && e.action === 'call' && preRaises === 0) limps++;
      if (street === 'preflop' && e.action === 'raise') preRaises++;
      const word =
        street === 'preflop' && e.action === 'raise'
          ? preRaises === 1
            ? limps > 0
              ? 'raise'
              : 'open'
            : `${preRaises + 1}-bet`
          : { fold: 'fold', check: 'x', call: 'call', bet: 'bet', raise: 'raise' }[e.action];
      cur.push(`${pos(e.seat)} ${word}${size ? ` ${size}` : ''}${e.allIn ? ' (all-in)' : ''}`);
    }
  }
  flush();
  return parts;
}

export const cardText = (c: Card) => cardToString(c);
