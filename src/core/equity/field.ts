/**
 * Equity between players who all hold ranges (a fixed hand is a range of one combo).
 *
 * - Two players, exact: before the flop from the preflop table (every pair of combos), after it
 *   by playing out every turn and river. Each runout scores every combo of both ranges once; the
 *   second range is then sorted by score, so each combo of the first finds the weight it beats
 *   or ties by binary search, minus the combos that share one of its cards.
 * - Three or more: Monte Carlo.
 */

import { cardsFromComboIndex, type Card } from '../cards';
import { CARD_HI, CARD_LO, evalPacked } from '../fastEval';
import type { Weights } from '../ranges/range';
import { checkBoard, liveCombos, packed, rng, type VillainCombo } from './equity';
import type { PreflopTable } from './preflopTable';

export interface PlayerEquity {
  /** Share of the pot, ties split. */
  equity: number;
  /** Wins alone / ties for the best hand; NaN when the method can't tell them apart (preflop table). */
  win: number;
  tie: number;
  /** Monte Carlo only. */
  stdError?: number;
  /** Equity of each of this player's combos against the others (index = combo); NaN if not played. */
  vsField: Float32Array;
  /** Weighted combos left after the board. */
  combos: number;
}

export interface FieldResult {
  players: PlayerEquity[];
  method: 'table' | 'exact' | 'monte-carlo';
  samples?: number;
}

const comboCards = Array.from({ length: 1326 }, (_, i) => cardsFromComboIndex(i));

/** Index of the first entry >= value (or > value with `after`) in sorted[from, to). */
function search(sorted: Int32Array, from: number, to: number, value: number, after: boolean): number {
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (after ? sorted[mid]! <= value : sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * For every combo of `a`: weight of `b` it beats, ties and faces, summed over all runouts.
 * Card removal is exact: combos sharing a card with the board, the runout or each other drop out.
 */
function sweep(a: VillainCombo[], b: VillainCombo[], board: readonly Card[]) {
  const [boardLo, boardHi] = packed(board);
  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!board.includes(c)) deck.push(c);
  const need = 5 - board.length;

  const won = new Float64Array(a.length);
  const tied = new Float64Array(a.length);
  const faced = new Float64Array(a.length);

  // per runout scratch space
  const keys = new Float64Array(b.length);
  const scores = new Int32Array(b.length);
  const cum = new Float64Array(b.length + 1);
  const cardScores = new Int32Array(52 * 51);
  const cardCum = new Float64Array(52 * 52);
  const cardCount = new Int32Array(52);
  const scoreOfCombo = new Int32Array(1326).fill(-1);
  const weightOfCombo = new Float64Array(1326);

  const playOut = (runLo: number, runHi: number) => {
    const lo = boardLo | runLo;
    const hi = boardHi | runHi;
    // score the second range, sort by score
    let n = 0;
    for (let j = 0; j < b.length; j++) {
      const v = b[j]!;
      if ((v.lo & runLo) | (v.hi & runHi)) continue;
      keys[n++] = evalPacked(v.lo | lo, v.hi | hi) * 2048 + j;
    }
    const sorted = keys.subarray(0, n).sort();
    cardCount.fill(0);
    cum[0] = 0;
    for (let k = 0; k < n; k++) {
      const key = sorted[k]!;
      const j = key % 2048;
      const score = (key - j) / 2048;
      const v = b[j]!;
      scores[k] = score;
      cum[k + 1] = cum[k]! + v.weight;
      scoreOfCombo[v.combo] = score;
      weightOfCombo[v.combo] = v.weight;
      const [c1, c2] = comboCards[v.combo]!;
      for (const c of [c1, c2]) {
        const at = cardCount[c]!;
        cardScores[c * 51 + at] = score;
        cardCum[c * 52 + at + 1] = cardCum[c * 52 + at]! + v.weight;
        cardCount[c] = at + 1;
      }
    }
    const total = cum[n]!;
    // weight of the second range below (or up to) a score, among all combos or those holding card c
    const below = (s: number, upTo: boolean) => cum[search(scores, 0, n, s, upTo)]!;
    const belowCard = (c: number, s: number, upTo: boolean) => cardCum[c * 52 + search(cardScores, c * 51, c * 51 + cardCount[c]!, s, upTo) - c * 51]!;

    for (let i = 0; i < a.length; i++) {
      const h = a[i]!;
      if ((h.lo & runLo) | (h.hi & runHi)) continue;
      const s = evalPacked(h.lo | lo, h.hi | hi);
      const [x, y] = comboCards[h.combo]!;
      const same = scoreOfCombo[h.combo]!; // the identical combo in the second range shares both cards
      const sameW = same >= 0 ? weightOfCombo[h.combo]! : 0;
      const less = below(s, false) - belowCard(x, s, false) - belowCard(y, s, false) + (same >= 0 && same < s ? sameW : 0);
      const upTo = below(s, true) - belowCard(x, s, true) - belowCard(y, s, true) + (same >= 0 && same <= s ? sameW : 0);
      const all = total - cardCum[x * 52 + cardCount[x]!]! - cardCum[y * 52 + cardCount[y]!]! + sameW;
      won[i]! += less;
      tied[i]! += upTo - less;
      faced[i]! += all;
    }
    for (let k = 0; k < n; k++) scoreOfCombo[b[sorted[k]! % 2048]!.combo] = -1;
  };

  if (need === 0) playOut(0, 0);
  else if (need === 1) for (const c of deck) playOut(CARD_LO[c]!, CARD_HI[c]!);
  else if (need === 2) {
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        const p = deck[i]!;
        const q = deck[j]!;
        playOut(CARD_LO[p]! | CARD_LO[q]!, CARD_HI[p]! | CARD_HI[q]!);
      }
    }
  } else throw new Error('Range against range after the flop needs at least three board cards');
  return { won, tied, faced };
}

function summarise(list: VillainCombo[], won: Float64Array, tied: Float64Array, faced: Float64Array): PlayerEquity {
  const vsField = new Float32Array(1326).fill(NaN);
  let w = 0;
  let t = 0;
  let f = 0;
  let combos = 0;
  list.forEach((h, i) => {
    combos += h.weight;
    if (faced[i]! > 0) vsField[h.combo] = (won[i]! + tied[i]! / 2) / faced[i]!;
    w += h.weight * won[i]!;
    t += h.weight * tied[i]!;
    f += h.weight * faced[i]!;
  });
  return { equity: f > 0 ? (w + t / 2) / f : NaN, win: f > 0 ? w / f : NaN, tie: f > 0 ? t / f : NaN, vsField, combos };
}

/**
 * Equity of each combo of `a` against range `b` on a flop, turn or river: one direction of
 * rangeVsRange (half the work). Index = combo; NaN where not in `a` or nothing of `b` is left.
 */
export function rangeEquity(a: Weights, b: Weights, board: readonly Card[]): Float32Array {
  checkBoard(board);
  if (board.length < 3) throw new Error('rangeEquity works after the flop');
  const [boardLo, boardHi] = packed(board);
  const listA = liveCombos(a, boardLo, boardHi);
  const listB = liveCombos(b, boardLo, boardHi);
  const out = new Float32Array(1326).fill(NaN);
  if (listA.length === 0 || listB.length === 0) return out;
  const { won, tied, faced } = sweep(listA, listB, board);
  listA.forEach((h, i) => {
    if (faced[i]! > 0) out[h.combo] = (won[i]! + tied[i]! / 2) / faced[i]!;
  });
  return out;
}

/** Two ranges, exact. Before the flop the preflop table is required. */
export function rangeVsRange(a: Weights, b: Weights, board: readonly Card[], table?: PreflopTable): FieldResult {
  checkBoard(board);
  const [boardLo, boardHi] = packed(board);
  const listA = liveCombos(a, boardLo, boardHi);
  const listB = liveCombos(b, boardLo, boardHi);
  if (listA.length === 0 || listB.length === 0) throw new Error('A range has no hands left after the board');

  if (board.length === 0) {
    if (!table) throw new Error('Preflop equity needs the preflop table');
    // every pair of combos that can be dealt together, weighted by both ranges
    const accA = new Float64Array(listA.length);
    const massA = new Float64Array(listA.length);
    const accB = new Float64Array(listB.length);
    const massB = new Float64Array(listB.length);
    listA.forEach((h, i) => {
      listB.forEach((v, j) => {
        if ((h.lo & v.lo) | (h.hi & v.hi)) return;
        const e = table.comboEquity(h.combo, v.combo);
        accA[i]! += v.weight * e;
        massA[i]! += v.weight;
        accB[j]! += h.weight * (1 - e);
        massB[j]! += h.weight;
      });
    });
    // the table holds equity only, so win and tie can't be told apart
    const side = (list: VillainCombo[], acc: Float64Array, mass: Float64Array): PlayerEquity => ({
      ...summarise(list, acc, new Float64Array(list.length), mass),
      win: NaN,
      tie: NaN,
    });
    return { players: [side(listA, accA, massA), side(listB, accB, massB)], method: 'table' };
  }

  const ab = sweep(listA, listB, board);
  const ba = sweep(listB, listA, board);
  return {
    players: [summarise(listA, ab.won, ab.tied, ab.faced), summarise(listB, ba.won, ba.tied, ba.faced)],
    method: 'exact',
  };
}

/**
 * Any number of ranges by sampling: each deal gives every player a hand from their range (by
 * weight; a deal where two hands collide is dealt again, which keeps the joint odds right) and the
 * rest of the board at random. Also tracks each combo's own result, for heat maps.
 */
export function monteCarloField(
  ranges: readonly Weights[],
  board: readonly Card[],
  { samples = 200_000, seed = 1 }: { samples?: number; seed?: number } = {},
): FieldResult {
  checkBoard(board);
  if (ranges.length < 2) throw new Error('At least two players');
  const random = rng(seed);
  const [boardLo, boardHi] = packed(board);
  const players = ranges.map((w) => {
    const list = liveCombos(w, boardLo, boardHi);
    if (list.length === 0) throw new Error('A range has no hands left after the board');
    const cumulative = new Float64Array(list.length);
    let total = 0;
    list.forEach((v, i) => (cumulative[i] = total += v.weight));
    return { list, cumulative, total };
  });
  const pick = (p: (typeof players)[number]) => {
    const x = random() * p.total;
    let lo = 0;
    let hi = p.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (p.cumulative[mid]! > x) hi = mid;
      else lo = mid + 1;
    }
    return p.list[lo]!;
  };

  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!board.includes(c)) deck.push(c);
  const need = 5 - board.length;
  const k = players.length;
  const dealt: VillainCombo[] = new Array(k);
  const scores = new Int32Array(k);
  const share = new Float64Array(k);
  const shareSq = new Float64Array(k);
  const wins = new Float64Array(k);
  const ties = new Float64Array(k);
  const comboShare = players.map(() => new Float64Array(1326));
  const comboSeen = players.map(() => new Float64Array(1326));

  let done = 0;
  let attempts = 0;
  while (done < samples) {
    if (++attempts > samples * 50) throw new Error('The ranges block each other too much to sample');
    let usedLo = boardLo;
    let usedHi = boardHi;
    let clash = false;
    for (let p = 0; p < k && !clash; p++) {
      const h = pick(players[p]!);
      if ((h.lo & usedLo) | (h.hi & usedHi)) clash = true;
      usedLo |= h.lo;
      usedHi |= h.hi;
      dealt[p] = h;
    }
    if (clash) continue;
    let runLo = 0;
    let runHi = 0;
    for (let n = 0; n < need; ) {
      const c = deck[Math.floor(random() * deck.length)]!;
      const l = CARD_LO[c]!;
      const h = CARD_HI[c]!;
      if ((l & usedLo) | (h & usedHi)) continue;
      usedLo |= l;
      usedHi |= h;
      runLo |= l;
      runHi |= h;
      n++;
    }
    const lo = boardLo | runLo;
    const hi = boardHi | runHi;
    let best = -1;
    let count = 0;
    for (let p = 0; p < k; p++) {
      const s = evalPacked(dealt[p]!.lo | lo, dealt[p]!.hi | hi);
      scores[p] = s;
      if (s > best) {
        best = s;
        count = 1;
      } else if (s === best) count++;
    }
    for (let p = 0; p < k; p++) {
      const got = scores[p] === best ? 1 / count : 0;
      share[p]! += got;
      shareSq[p]! += got * got;
      if (got === 1) wins[p]!++;
      else if (got > 0) ties[p]!++;
      comboShare[p]![dealt[p]!.combo]! += got;
      comboSeen[p]![dealt[p]!.combo]!++;
    }
    done++;
  }

  return {
    method: 'monte-carlo',
    samples,
    players: players.map((pl, p) => {
      const mean = share[p]! / samples;
      const vsField = new Float32Array(1326).fill(NaN);
      for (let c = 0; c < 1326; c++) if (comboSeen[p]![c]! > 0) vsField[c] = comboShare[p]![c]! / comboSeen[p]![c]!;
      return {
        equity: mean,
        win: wins[p]! / samples,
        tie: ties[p]! / samples,
        stdError: Math.sqrt(Math.max(0, shareSq[p]! / samples - mean * mean) / samples),
        vsField,
        combos: pl.total,
      };
    }),
  };
}

// ---- by group: one pass, the parts against each group of the second range --------------------

/**
 * What combo `a` scores against each group of range `b`, unnormalised, so any re-weighting of
 * the groups is a sum: equity against `b` with group g scaled by k[g] is
 *   Σ_g k[g]·share[c·G+g]  /  Σ_g k[g]·faced[c·G+g].
 * `share` = weight beaten + half the weight tied, `faced` = weight not blocked (card removal
 * exact, as in rangeEquity). `runouts`: every turn and river (equity) or the board as it is
 * (who is ahead now). Index c = combo of `a`.
 */
export interface GroupParts {
  groups: number;
  share: Float64Array;
  faced: Float64Array;
  /** Weight of each group of `b` left after the board. */
  total: Float64Array;
}

export function partsByGroup(a: Weights, b: Weights, board: readonly Card[], group: ArrayLike<number>, G: number, runouts: boolean): GroupParts {
  checkBoard(board);
  if (board.length < 3) throw new Error('partsByGroup works after the flop');
  const [boardLo, boardHi] = packed(board);
  const listA = liveCombos(a, boardLo, boardHi);
  const listB = liveCombos(b, boardLo, boardHi).filter((v) => group[v.combo]! >= 0);
  const share = new Float64Array(1326 * G);
  const faced = new Float64Array(1326 * G);
  const total = new Float64Array(G);
  for (const v of listB) total[group[v.combo]!]! += v.weight;
  if (listA.length === 0 || listB.length === 0) return { groups: G, share, faced, total };

  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!board.includes(c)) deck.push(c);
  const need = runouts ? 5 - board.length : 0;

  const keys = new Float64Array(listB.length);
  const scores = new Int32Array(listB.length);
  const cum = new Float64Array((listB.length + 1) * G);
  const cardScores = new Int32Array(52 * 51);
  const cardCum = new Float64Array(52 * 52 * G);
  const cardCount = new Int32Array(52);
  const scoreOfCombo = new Int32Array(1326).fill(-1);
  const groupOf = (j: number) => group[listB[j]!.combo]!;

  const playOut = (runLo: number, runHi: number) => {
    const lo = boardLo | runLo;
    const hi = boardHi | runHi;
    let n = 0;
    for (let j = 0; j < listB.length; j++) {
      const v = listB[j]!;
      if ((v.lo & runLo) | (v.hi & runHi)) continue;
      keys[n++] = evalPacked(v.lo | lo, v.hi | hi) * 2048 + j;
    }
    const sorted = keys.subarray(0, n).sort();
    cardCount.fill(0);
    for (let g = 0; g < G; g++) cum[g] = 0;
    for (let k = 0; k < n; k++) {
      const key = sorted[k]!;
      const j = key % 2048;
      const score = (key - j) / 2048;
      const v = listB[j]!;
      const g0 = groupOf(j);
      scores[k] = score;
      for (let g = 0; g < G; g++) cum[(k + 1) * G + g] = cum[k * G + g]! + (g === g0 ? v.weight : 0);
      scoreOfCombo[v.combo] = score;
      const [c1, c2] = comboCards[v.combo]!;
      for (const c of [c1, c2]) {
        const at = cardCount[c]!;
        cardScores[c * 51 + at] = score;
        const from = (c * 52 + at) * G;
        // row `at` = the card's first `at` combos (row 0 is never written: always zero)
        for (let g = 0; g < G; g++) cardCum[from + G + g] = cardCum[from + g]! + (g === g0 ? v.weight : 0);
        cardCount[c] = at + 1;
      }
    }
    const pos = (s: number, upTo: boolean) => search(scores, 0, n, s, upTo);
    const posCard = (c: number, s: number, upTo: boolean) => search(cardScores, c * 51, c * 51 + cardCount[c]!, s, upTo) - c * 51;

    for (const h of listA) {
      if ((h.lo & runLo) | (h.hi & runHi)) continue;
      const s = evalPacked(h.lo | lo, h.hi | hi);
      const [x, y] = comboCards[h.combo]!;
      const same = scoreOfCombo[h.combo]!;
      const sameG = same >= 0 ? group[h.combo]! : -1;
      const sameW = same >= 0 ? (b[h.combo] ?? 0) : 0;
      const kLess = pos(s, false);
      const kUp = pos(s, true);
      const xLess = posCard(x, s, false);
      const xUp = posCard(x, s, true);
      const yLess = posCard(y, s, false);
      const yUp = posCard(y, s, true);
      const kl = kLess * G;
      const ku = kUp * G;
      const kn = n * G;
      const xl = (x * 52 + xLess) * G;
      const xu = (x * 52 + xUp) * G;
      const xa = (x * 52 + cardCount[x]!) * G;
      const yl = (y * 52 + yLess) * G;
      const yu = (y * 52 + yUp) * G;
      const ya = (y * 52 + cardCount[y]!) * G;
      const out = h.combo * G;
      for (let g = 0; g < G; g++) {
        let less = cum[kl + g]! - cardCum[xl + g]! - cardCum[yl + g]!;
        let upTo = cum[ku + g]! - cardCum[xu + g]! - cardCum[yu + g]!;
        let all = cum[kn + g]! - cardCum[xa + g]! - cardCum[ya + g]!;
        if (g === sameG) {
          if (same < s) less += sameW;
          if (same <= s) upTo += sameW;
          all += sameW;
        }
        share[out + g]! += (less + upTo) / 2;
        faced[out + g]! += all;
      }
    }
    for (let k = 0; k < n; k++) scoreOfCombo[listB[sorted[k]! % 2048]!.combo] = -1;
  };

  if (need === 0) playOut(0, 0);
  else if (need === 1) for (const c of deck) playOut(CARD_LO[c]!, CARD_HI[c]!);
  else
    for (let i = 0; i < deck.length; i++)
      for (let j = i + 1; j < deck.length; j++) {
        const p = deck[i]!;
        const q = deck[j]!;
        playOut(CARD_LO[p]! | CARD_LO[q]!, CARD_HI[p]! | CARD_HI[q]!);
      }
  return { groups: G, share, faced, total };
}

/** Equity (or lead) per combo against the groups re-weighted by k; NaN where nothing is faced. */
export function fromParts(p: GroupParts, k: ArrayLike<number>): Float32Array {
  const out = new Float32Array(1326).fill(NaN);
  const G = p.groups;
  for (let c = 0; c < 1326; c++) {
    let s = 0;
    let f = 0;
    for (let g = 0; g < G; g++) {
      s += k[g]! * p.share[c * G + g]!;
      f += k[g]! * p.faced[c * G + g]!;
    }
    if (f > 0) out[c] = s / f;
  }
  return out;
}
