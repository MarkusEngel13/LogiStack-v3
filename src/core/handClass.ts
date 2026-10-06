/**
 * What a hand has on a board, in the classes players think in: top pair with a good kicker,
 * a set, a nut flush draw, a gutshot. Only what the hole cards add counts; a hand that plays the
 * board's pair, trips, straight or flush is classed by its own cards (ace-high, air, ...).
 *
 * Class names follow v2's categoriser and Marius's flop Excel. Pair positions count the board's
 * unpaired ranks above the pair (on J-J-5 a five is top pair). Pocket pairs below the top card
 * take the position they would have as a board pair (88 on K-7-2 is second pair, `pocket`).
 */

import type { Card } from './cards';
import { CARD_HI, CARD_LO, evalPacked } from './fastEval';

export const MADE_CLASSES = [
  'straight-flush',
  'quads',
  'full-house',
  'flush',
  'straight',
  'set',
  'trips',
  'two-pair',
  'overpair',
  'top-pair',
  'second-pair',
  'third-pair',
  'low-pair',
  'ace-high',
  'king-high',
  'air',
] as const;
export type MadeClass = (typeof MADE_CLASSES)[number];

export const MADE_LABELS: Record<MadeClass, string> = {
  'straight-flush': 'Straight flush',
  quads: 'Quads',
  'full-house': 'Full house',
  flush: 'Flush',
  straight: 'Straight',
  set: 'Set',
  trips: 'Trips',
  'two-pair': 'Two pair',
  overpair: 'Overpair',
  'top-pair': 'Top pair',
  'second-pair': '2nd pair',
  'third-pair': '3rd pair',
  'low-pair': 'Low pair',
  'ace-high': 'Ace-high',
  'king-high': 'King-high',
  air: 'Air',
};

/** How high among what the board allows: the nuts, second best, third best, below. */
export type Level = 'nut' | 'second' | 'third' | 'low';
/** Kicker against the ranks not on the board: the best, 2nd-3rd, 4th-6th, the rest. */
export type Kicker = 'top' | 'good' | 'medium' | 'weak';

export interface HandClass {
  made: MadeClass;
  /** Pairs (not pocket) and trips. */
  kicker: Kicker | null;
  /** Straights, flushes, straight flushes. */
  level: Level | null;
  /** Sets: which board card. Two pair: top two / top and a lower card / two lower cards. */
  position: 'top' | 'middle' | 'bottom' | null;
  /** The pair is a pocket pair (overpairs and the pocket pairs below the top card). */
  pocket: boolean;
  /** Four to a flush with at least one hole card, and how high the flush would be. */
  flushDraw: Level | null;
  /** Ranks that would give a (better) straight: 'open' = two or more (double gutshots too), 'gutshot' = one. */
  straightDraw: 'open' | 'gutshot' | null;
  /** Every rank that completes the straight draw makes the best possible straight. */
  straightDrawToNuts: boolean;
  /** Flop only: three to a flush / a straight with a hole card, two cards needed. */
  backdoorFlush: boolean;
  backdoorStraight: boolean;
  /** Hole cards above the board's top card, for hands without a pair. */
  overcards: 0 | 1 | 2;
}

const rankOf = (c: Card) => c % 13;
const suitOf = (c: Card) => Math.floor(c / 13);

/** High rank of the best straight in a rank mask (ace low too), or -1. */
function straightHigh(mask: number): number {
  const m = (mask << 1) | ((mask >> 12) & 1);
  for (let top = 13; top >= 4; top--) {
    const run = 0b11111 << (top - 4);
    if ((m & run) === run) return top - 1;
  }
  return -1;
}

/** The five ranks of the straight with high card h (h = 3 is the wheel). */
const windowMask = (h: number) => (h === 3 ? 0b1111 | (1 << 12) : 0b11111 << (h - 4));

const popcount = (x: number) => {
  let n = 0;
  for (let v = x; v; v &= v - 1) n++;
  return n;
};

/** Straight highs some two hole cards could reach on this board (three board ranks in the window). */
function reachableStraights(boardMask: number): number[] {
  const out: number[] = [];
  for (let h = 12; h >= 3; h--) if (popcount(boardMask & windowMask(h)) >= 3) out.push(h);
  return out;
}

const levelOf = (index: number): Level => (index <= 0 ? 'nut' : index === 1 ? 'second' : index === 2 ? 'third' : 'low');

interface Board {
  cards: readonly Card[];
  lo: number;
  hi: number;
  count: number[];
  mask: number;
  suitCount: number[];
  suitMask: number[];
  topRank: number;
  /** Ranks on the board once, highest first. */
  unpaired: number[];
  /** Ranks not on the board, highest first (kicker ladder). */
  kickerLadder: number[];
  score5: number;
  straights: number[];
}

function boardInfo(cards: readonly Card[]): Board {
  const count = new Array<number>(13).fill(0);
  const suitCount = [0, 0, 0, 0];
  const suitMask = [0, 0, 0, 0];
  let lo = 0;
  let hi = 0;
  let mask = 0;
  for (const c of cards) {
    count[rankOf(c)]!++;
    suitCount[suitOf(c)]!++;
    suitMask[suitOf(c)]! |= 1 << rankOf(c);
    mask |= 1 << rankOf(c);
    lo |= CARD_LO[c]!;
    hi |= CARD_HI[c]!;
  }
  const unpaired: number[] = [];
  const kickerLadder: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (count[r] === 1) unpaired.push(r);
    if (count[r] === 0) kickerLadder.push(r);
  }
  return {
    cards,
    lo,
    hi,
    count,
    mask,
    suitCount,
    suitMask,
    topRank: 31 - Math.clz32(mask),
    unpaired,
    kickerLadder,
    score5: cards.length === 5 ? evalPacked(lo, hi) : -1,
    straights: reachableStraights(mask),
  };
}

function kickerOf(rank: number, b: Board): Kicker {
  const i = b.kickerLadder.indexOf(rank);
  return i === 0 ? 'top' : i >= 1 && i <= 2 ? 'good' : i >= 3 && i <= 5 ? 'medium' : 'weak';
}

/** Position of a pair: how many unpaired board ranks are above it. */
const pairClass = (rank: number, b: Board): MadeClass => {
  const above = b.unpaired.filter((r) => r > rank).length;
  return above === 0 ? 'top-pair' : above === 1 ? 'second-pair' : above === 2 ? 'third-pair' : 'low-pair';
};

function classify(a: Card, c: Card, b: Board): HandClass {
  const [h1, h2] = rankOf(a) >= rankOf(c) ? [a, c] : [c, a];
  const r1 = rankOf(h1);
  const r2 = rankOf(h2);
  const pocket = r1 === r2;
  const lo = b.lo | CARD_LO[a]! | CARD_LO[c]!;
  const hi = b.hi | CARD_HI[a]! | CARD_HI[c]!;
  const score = evalPacked(lo, hi);
  const category = score >> 20;
  // on a five-card board the hole cards must beat what the board shows on its own
  const improves = b.score5 < 0 || score > b.score5;

  const out: HandClass = {
    made: 'air',
    kicker: null,
    level: null,
    position: null,
    pocket: false,
    flushDraw: null,
    straightDraw: null,
    straightDrawToNuts: false,
    backdoorFlush: false,
    backdoorStraight: false,
    overcards: 0,
  };

  const holeOfSuit = (s: number) => (suitOf(a) === s ? 1 : 0) + (suitOf(c) === s ? 1 : 0);
  const highestOfSuit = (s: number) => Math.max(suitOf(a) === s ? rankOf(a) : -1, suitOf(c) === s ? rankOf(c) : -1);
  /** Rank of a hole card among the ranks of its suit not on the board. */
  const flushLevel = (s: number) => {
    const missing: number[] = [];
    for (let r = 12; r >= 0; r--) if (!(b.suitMask[s]! & (1 << r))) missing.push(r);
    return levelOf(missing.indexOf(highestOfSuit(s)));
  };
  const flushSuit = [0, 1, 2, 3].find((s) => b.suitCount[s]! + holeOfSuit(s) >= 5);

  if (category === 8 && improves) {
    out.made = 'straight-flush';
    out.level = levelOf(b.straights.indexOf((score >> 16) & 15));
  } else if (category === 7 && (b.count[r1] === 3 || b.count[r1] === 2 && pocket || b.count[r2] === 3)) {
    out.made = 'quads';
  } else if (category === 6 && improves && (b.count[r1]! >= 1 || b.count[r2]! >= 1)) {
    out.made = 'full-house';
  } else if (category === 5 && improves && flushSuit !== undefined && holeOfSuit(flushSuit) > 0) {
    out.made = 'flush';
    out.level = flushLevel(flushSuit);
  } else if (category === 4 && improves) {
    out.made = 'straight';
    out.level = levelOf(b.straights.indexOf((score >> 16) & 15));
  } else if (pocket && b.count[r1] === 1) {
    out.made = 'set';
    out.pocket = true;
    const i = b.unpaired.indexOf(r1);
    out.position = i === 0 ? 'top' : i === b.unpaired.length - 1 ? 'bottom' : 'middle';
  } else if (!pocket && (b.count[r1] === 2 || b.count[r2] === 2)) {
    out.made = 'trips';
    out.kicker = kickerOf(b.count[r1] === 2 ? r2 : r1, b);
  } else if (!pocket && b.count[r1] === 1 && b.count[r2] === 1) {
    out.made = 'two-pair';
    const i1 = b.unpaired.indexOf(r1);
    const i2 = b.unpaired.indexOf(r2);
    out.position = i1 === 0 && i2 === 1 ? 'top' : i1 === 0 ? 'middle' : 'bottom';
  } else if (pocket && b.count[r1] === 0) {
    out.pocket = true;
    out.made = r1 > b.topRank ? 'overpair' : pairClass(r1, b);
  } else if (!pocket && (b.count[r1] === 1 || b.count[r2] === 1)) {
    const paired = b.count[r1] === 1 ? r1 : r2;
    out.made = pairClass(paired, b);
    out.kicker = kickerOf(paired === r1 ? r2 : r1, b);
  } else {
    out.made = r1 === 12 ? 'ace-high' : r1 === 11 ? 'king-high' : 'air';
    out.overcards = ((r1 > b.topRank ? 1 : 0) + (r2 > b.topRank ? 1 : 0)) as 0 | 1 | 2;
  }

  // draws: only with cards to come, and only below a straight
  if (b.cards.length < 5 && MADE_CLASSES.indexOf(out.made) > MADE_CLASSES.indexOf('straight')) {
    const holeMask = (1 << r1) | (1 << r2);
    for (let s = 0; s < 4; s++) {
      const mine = holeOfSuit(s);
      if (mine > 0 && b.suitCount[s]! + mine === 4) out.flushDraw = flushLevel(s);
    }
    // ranks that complete a straight the hole cards take part in
    let completing = 0;
    let toNuts = 0;
    for (let x = 0; x < 13; x++) {
      const seen = b.count[x]! + (r1 === x ? 1 : 0) + (r2 === x ? 1 : 0);
      if (seen >= 4) continue;
      const mine = straightHigh(b.mask | holeMask | (1 << x));
      if (mine < 0 || mine <= straightHigh(b.mask | (1 << x))) continue;
      completing++;
      const best = reachableStraights(b.mask | (1 << x))[0];
      if (mine === best) toNuts++;
    }
    if (completing > 0) {
      out.straightDraw = completing >= 2 ? 'open' : 'gutshot';
      out.straightDrawToNuts = toNuts === completing;
    }
    if (b.cards.length === 3) {
      for (let s = 0; s < 4; s++) {
        const mine = holeOfSuit(s);
        if (mine > 0 && b.suitCount[s]! + mine === 3) out.backdoorFlush = true;
      }
      if (!out.straightDraw) {
        for (let h = 12; h >= 3; h--) {
          const w = windowMask(h);
          if (popcount((b.mask | holeMask) & w) === 3 && holeMask & w & ~b.mask) out.backdoorStraight = true;
        }
      }
    }
  }
  return out;
}

const ONE_PAIR: readonly MadeClass[] = ['overpair', 'top-pair', 'second-pair', 'third-pair', 'low-pair'];

export const DRAW_ROWS = [
  ['flush-draw', 'Flush draw'],
  ['nut-flush-draw', '  of which nut'],
  ['open', 'Open-ended / double gutshot'],
  ['gutshot', 'Gutshot'],
  ['flush-and-straight', 'Flush draw + straight draw'],
  ['pair-and-flush', 'Pair + flush draw'],
  ['pair-and-straight', 'Pair + straight draw'],
  ['backdoor-flush', 'Backdoor flush draw'],
  ['backdoor-straight', 'Backdoor straight draw'],
] as const;
export type DrawRow = (typeof DRAW_ROWS)[number][0];

function drawRowsOf(h: HandClass): DrawRow[] {
  const rows: DrawRow[] = [];
  const pair = ONE_PAIR.includes(h.made);
  if (h.flushDraw) rows.push('flush-draw');
  if (h.flushDraw === 'nut') rows.push('nut-flush-draw');
  if (h.straightDraw === 'open') rows.push('open');
  if (h.straightDraw === 'gutshot') rows.push('gutshot');
  if (h.flushDraw && h.straightDraw) rows.push('flush-and-straight');
  if (pair && h.flushDraw) rows.push('pair-and-flush');
  if (pair && h.straightDraw) rows.push('pair-and-straight');
  if (h.backdoorFlush) rows.push('backdoor-flush');
  if (h.backdoorStraight) rows.push('backdoor-straight');
  return rows;
}

export interface ClassRow {
  /** Weighted combos of the range in this class. */
  combos: number;
  /** Weighted average of the combos' equity, when one was given (NaN otherwise). */
  equity: number;
}

export interface RangeClasses {
  /** Weighted combos left on this board. */
  total: number;
  made: Record<MadeClass, ClassRow>;
  /** Draws overlap the made classes (top pair with a flush draw counts in both). */
  draws: Record<DrawRow, ClassRow>;
}

/**
 * A range on a board, class by class (Marius's Excel "made hands" and "draws" summaries).
 * With per-combo equities (index = combo), each row also gets its average equity.
 */
export function rangeClasses(board: readonly Card[], weights: Float32Array, equityOf?: Float32Array): RangeClasses {
  const classes = classifyAll(board);
  const row = (): ClassRow & { known: number; sum: number } => ({ combos: 0, equity: NaN, known: 0, sum: 0 });
  const made = Object.fromEntries(MADE_CLASSES.map((k) => [k, row()])) as Record<MadeClass, ReturnType<typeof row>>;
  const draws = Object.fromEntries(DRAW_ROWS.map(([k]) => [k, row()])) as Record<DrawRow, ReturnType<typeof row>>;
  let total = 0;
  const add = (r: ReturnType<typeof row>, w: number, e: number | undefined) => {
    r.combos += w;
    if (e !== undefined && !Number.isNaN(e)) {
      r.known += w;
      r.sum += w * e;
    }
  };
  classes.forEach((h, combo) => {
    const w = weights[combo]!;
    if (!h || !(w > 0)) return;
    total += w;
    const e = equityOf?.[combo];
    add(made[h.made], w, e);
    for (const d of drawRowsOf(h)) add(draws[d], w, e);
  });
  const finish = (r: ReturnType<typeof row>): ClassRow => ({ combos: r.combos, equity: r.known > 0 ? r.sum / r.known : NaN });
  return {
    total,
    made: Object.fromEntries(MADE_CLASSES.map((k) => [k, finish(made[k])])) as Record<MadeClass, ClassRow>,
    draws: Object.fromEntries(DRAW_ROWS.map(([k]) => [k, finish(draws[k])])) as Record<DrawRow, ClassRow>,
  };
}

/** The class of one hand on a board (3-5 distinct cards, none shared with the hand). */
export function classifyHand(hole: readonly [Card, Card], board: readonly Card[]): HandClass {
  if (board.length < 3 || board.length > 5) throw new Error('Hand classes need a flop, turn or river');
  return classify(hole[0], hole[1], boardInfo(board));
}

/** Classes of all 1326 combos on a board; null for combos that use a board card. */
export function classifyAll(board: readonly Card[]): (HandClass | null)[] {
  if (board.length < 3 || board.length > 5) throw new Error('Hand classes need a flop, turn or river');
  const b = boardInfo(board);
  const out: (HandClass | null)[] = new Array(1326).fill(null);
  let i = 0;
  for (let hiCard = 1; hiCard < 52; hiCard++) {
    for (let loCard = 0; loCard < hiCard; loCard++, i++) {
      if (board.includes(hiCard) || board.includes(loCard)) continue;
      out[i] = classify(hiCard, loCard, b);
    }
  }
  return out;
}
