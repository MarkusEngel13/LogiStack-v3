/**
 * Quick card entry for the live table: everything that turns a few taps into real cards.
 *
 * - A hand class from the 13x13 grid ("AKs") becomes two real cards, suits picked so they don't
 *   clash with any card already in play. Such suits are guesses: the hand notes the seat
 *   (`guessedSeats`), and a board card it turns out to hold moves the hand to other suits.
 * - A board can be entered as ranks plus a texture (rainbow, two-tone, monotone); the turn and
 *   river as a rank plus "no flush card", "flush card" or "flush draw". Exact suits can be fixed
 *   later by cycling a card's suit.
 * - Where the hand stands (over, who still has to show) and a one-line-per-street summary.
 */

import { RANK_CHARS, cardToString, parseCard, prettyCard, rankOf, suitOf, type Card } from '../cards';
import type { SeatState, TableState } from '../engine/state';
import type { CardStr, HandRecord, SeatNo } from '../hand/types';
import { cellKind, cellOfCards, cellRanks } from '../ranges/hands';

// ---- cards -------------------------------------------------------------------------------------

const card = (rank: number, suit: number): Card => suit * 13 + rank;

/** Every card already in play: the board and all known hole cards. */
export function usedCards(state: TableState): Set<Card> {
  const out = new Set<Card>(state.board);
  for (const s of state.seats) for (const c of s.cards ?? []) out.add(c);
  return out;
}

/** The real cards of a grid cell, in a fixed order: suited and offsuit hands spades first. */
function cellCombos(cell: number): [Card, Card][] {
  const [hi, lo] = cellRanks(cell);
  const kind = cellKind(cell);
  const out: [Card, Card][] = [];
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      if (kind === 'suited' ? a !== b : kind === 'pair' ? b <= a : a === b) continue;
      out.push([card(hi, a), card(lo, b)]);
    }
  }
  return out;
}

/**
 * Two real cards for a grid cell ("AKs" = cell), avoiding `used`. Suited hands try spades first,
 * offsuit and pairs spades + hearts first. With a `board`, suits that would pair up with it
 * (a flush draw nobody saw) come last. null if every combo of the cell is blocked.
 */
export function cellCards(cell: number, used: ReadonlySet<Card>, board: readonly Card[] = []): [Card, Card] | null {
  const onBoard = (c: Card) => board.filter((b) => suitOf(b) === suitOf(c)).length;
  let best: { cards: [Card, Card]; score: number } | null = null;
  for (const combo of cellCombos(cell)) {
    if (used.has(combo[0]) || used.has(combo[1])) continue;
    const score = onBoard(combo[0]) + onBoard(combo[1]);
    if (!best || score < best.score) best = { cards: combo, score };
  }
  return best ? best.cards : null;
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
 * What a turn or river card does to the flush picture:
 * 'blank' = no flush card (a suit the board has least of),
 * 'flush' = a flush card (the suit the board has most of: three of a suit, or four),
 * 'draw'  = a flush draw (a suit the board has once: on a two-tone flop the second draw).
 */
export type StreetKind = 'blank' | 'flush' | 'draw';

const suitCounts = (board: readonly Card[]) => [0, 1, 2, 3].map((s) => board.filter((c) => suitOf(c) === s).length);

/**
 * The turn or river from a rank and a kind. Ties go away from your suits for a blank or a draw
 * (nobody gave you a draw) and to your suit for a flush card.
 */
export function streetCard(rank: number, kind: StreetKind, board: readonly Card[], used: ReadonlySet<Card>, heroSuits: readonly number[] = []): Card | null {
  const count = suitCounts(board);
  let best: { c: Card; score: number } | null = null;
  for (let s = 0; s < 4; s++) {
    const c = card(rank, s);
    if (used.has(c)) continue;
    const mine = heroSuits.includes(s) ? 1 : 0;
    const score =
      kind === 'blank'
        ? -count[s]! * 10 - mine
        : kind === 'flush'
          ? count[s]! * 10 + mine
          : (count[s] === 1 ? 100 : count[s] === 0 ? 10 : 0) - mine;
    const stable = score - s * 0.01;
    if (!best || stable > best.score) best = { c, score: stable };
  }
  return best ? best.c : null;
}

/**
 * The kinds that mean something for the next card on this board, with their labels: on a rainbow
 * flop the turn can bring a flush draw but no flush card; on a two-tone flop a flush card or a
 * second flush draw; the river only a flush card (when some suit is there twice).
 */
export function streetKinds(board: readonly Card[]): { kind: StreetKind; label: string }[] {
  const count = suitCounts(board);
  const most = Math.max(...count);
  const draws = count.filter((n) => n >= 2).length;
  const out: { kind: StreetKind; label: string }[] = [{ kind: 'blank', label: 'No flush card' }];
  if (most >= 2) out.push({ kind: 'flush', label: 'Flush card' });
  if (board.length === 3 && count.includes(1)) out.push({ kind: 'draw', label: draws > 0 ? 'Second flush draw' : 'Flush draw' });
  return out;
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

// ---- guessed suits -----------------------------------------------------------------------------

/**
 * What the live screen notes on a hand (HandRecord.quick). `guessed`: seats whose hole cards were
 * picked on the 13x13 grid, so their suits are a guess and may move to make room for a board card.
 */
export interface QuickNotes {
  guessedSuits?: boolean;
  guessed?: SeatNo[];
}

export const guessedSeats = (h: HandRecord): SeatNo[] => (h.quick as QuickNotes | undefined)?.guessed ?? [];

/** Sets a seat's hole cards; `guessed` when they came from the 13x13 grid. */
export function withHoleCards(h: HandRecord, seat: SeatNo, cards: readonly [CardStr, CardStr], guessed: boolean): HandRecord {
  const others = guessedSeats(h).filter((s) => s !== seat);
  const quick: QuickNotes = { ...h.quick, guessed: guessed ? [...others, seat] : others };
  if (!quick.guessed!.length) delete quick.guessed;
  return {
    ...h,
    players: h.players.map((p) => (p.seat === seat ? { ...p, cards: [cards[0], cards[1]] } : p)),
    quick,
  };
}

/** Board cards entered so far (from the events). */
const boardOf = (h: HandRecord): Card[] => h.events.flatMap((e) => (e.type === 'board' ? e.cards.map(parseCard) : []));

/**
 * Makes room for `cards` (board cards, or a seat's real hole cards): a guessed hand holding one
 * of them moves to other suits of the same class (AKs stays suited), away from the board's suits
 * where it can. `except`: the seat whose cards are being replaced. null when a hand can't move,
 * or a hand that isn't a guess holds one of the cards.
 */
export function makeRoom(h: HandRecord, cards: readonly Card[], except?: SeatNo): HandRecord | null {
  const guessed = new Set(guessedSeats(h));
  const board = [...boardOf(h), ...cards];
  const shown = h.events.flatMap((e) => (e.type === 'show' && e.cards ? e.cards.map(parseCard) : []));
  let players = h.players;
  for (const p of h.players) {
    if (p.seat === except || !p.cards) continue;
    const held = p.cards.map(parseCard) as [Card, Card];
    if (!held.some((c) => cards.includes(c))) continue;
    if (!guessed.has(p.seat)) return null;
    const used = new Set<Card>([...board, ...shown]);
    for (const o of players) if (o.seat !== p.seat && o.seat !== except && o.cards) for (const c of o.cards) used.add(parseCard(c));
    const moved = cellCards(cellOfCards(held[0], held[1]), used, board);
    if (!moved) return null;
    players = players.map((o) => (o.seat === p.seat ? { ...o, cards: [cardToString(moved[0]), cardToString(moved[1])] } : o));
  }
  return players === h.players ? h : { ...h, players };
}

/**
 * Cards a seat could take although they're in play: the cards of guessed hands (other than
 * `except`'s own), which move when taken.
 */
export function softCards(h: HandRecord, except?: SeatNo): Set<Card> {
  const guessed = new Set(guessedSeats(h));
  const out = new Set<Card>();
  for (const p of h.players) if (p.seat !== except && guessed.has(p.seat) && p.cards) for (const c of p.cards) out.add(parseCard(c));
  return out;
}

// ---- where the hand is ------------------------------------------------------------------------

export const handOver = (state: TableState) => state.phase === 'complete' || (state.phase === 'showdown' && !!state.result?.resolved);

/** Players at showdown whose cards are still needed (not known, not shown, not mucked). */
export function showdownUnknown(state: TableState): SeatState[] {
  if (state.phase !== 'showdown') return [];
  return state.seats.filter((s) => s.dealtIn && !s.folded && !s.mucked && !s.cards);
}

/** Clockwise steps from seat `from` to seat `to` (0 = the same seat). */
export const clockwise = (state: TableState, from: SeatNo, to: SeatNo) => (((to - from) % state.rules.tableSeats) + state.rules.tableSeats) % state.rules.tableSeats;

const FRACTION_TEXT: Record<string, string> = { '0.33': '⅓', '0.5': '½', '0.66': '⅔', '0.75': '¾', '1': 'pot' };
export const fractionText = (f: number) => FRACTION_TEXT[String(f)] ?? `${Math.round(f * 100)}%`;

/** A bet's share of the pot as the nearest usual size ("½") when it's within a few percent of one. */
function sizeText(f: number): string {
  const near = [0.33, 0.5, 0.66, 0.75, 1].find((x) => Math.abs(x - f) <= 0.04);
  return near !== undefined ? fractionText(near) : `${Math.round(f * 100)}%`;
}

const bbText = (x: number) => `${Math.round(x * 10) / 10} BB`;

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
