/**
 * Hero's equity against villain ranges.
 *
 * - Heads-up, exact on every street: before the flop from the preflop table, after it by
 *   playing out every turn and river. Each runout evaluates Hero once and every villain combo
 *   once, so a full range on the flop is ~1.2 M evaluations (tens of milliseconds).
 * - Multiway: Monte Carlo (three-way equities can't be built from two-way ones).
 *
 * Equity is Hero's share of the pot at showdown: a two-way tie counts half, a three-way tie a third.
 */

import { cardsFromComboIndex, type Card } from '../cards';
import { CARD_HI, CARD_LO, evalPacked } from '../fastEval';
import type { Weights } from '../ranges/range';
import type { PreflopTable } from './preflopTable';

export interface EquityResult {
  /** Hero's share of the pot, 0..1. */
  equity: number;
  /** Hero's equity against each villain combo (index = combo); NaN where the combo isn't in play. */
  vsCombo: Float32Array;
  /** Weighted villain combos left after removing the cards Hero holds and the board shows. */
  combos: number;
  method: 'table' | 'exact';
}

function checkCards(hero: readonly Card[], board: readonly Card[]) {
  if (hero.length !== 2) throw new Error('Hero needs two cards');
  if (![0, 3, 4, 5].includes(board.length)) throw new Error('The board has 0, 3, 4 or 5 cards');
  const all = [...hero, ...board];
  if (all.some((c) => !Number.isInteger(c) || c < 0 || c > 51) || new Set(all).size !== all.length) {
    throw new Error('Cards must be distinct, 0..51');
  }
}

interface VillainCombo {
  combo: number;
  lo: number;
  hi: number;
  weight: number;
}

/** Villain combos with weight that don't use a dead card. */
function liveCombos(villain: Weights, deadLo: number, deadHi: number): VillainCombo[] {
  const out: VillainCombo[] = [];
  for (let combo = 0; combo < 1326; combo++) {
    const weight = villain[combo]!;
    if (!(weight > 0)) continue;
    const [a, b] = cardsFromComboIndex(combo);
    const lo = CARD_LO[a]! | CARD_LO[b]!;
    const hi = CARD_HI[a]! | CARD_HI[b]!;
    if ((lo & deadLo) | (hi & deadHi)) continue;
    out.push({ combo, lo, hi, weight });
  }
  return out;
}

const packed = (cards: readonly Card[]) => {
  let lo = 0;
  let hi = 0;
  for (const c of cards) {
    lo |= CARD_LO[c]!;
    hi |= CARD_HI[c]!;
  }
  return [lo, hi] as const;
};

/**
 * Hero vs one villain range, exact. Before the flop the preflop table is required.
 */
export function equityVsRange(hero: readonly Card[], board: readonly Card[], villain: Weights, table?: PreflopTable): EquityResult {
  checkCards(hero, board);
  const [heroLo, heroHi] = packed(hero);
  const [boardLo, boardHi] = packed(board);
  const combos = liveCombos(villain, heroLo | boardLo, heroHi | boardHi);
  const vsCombo = new Float32Array(1326).fill(NaN);

  if (board.length === 0) {
    if (!table) throw new Error('Preflop equity needs the preflop table');
    for (const v of combos) {
      const [a, b] = cardsFromComboIndex(v.combo);
      vsCombo[v.combo] = table.equity(hero[0]!, hero[1]!, a, b);
    }
    return summarise(combos, vsCombo, 'table');
  }

  // The cards still to come: every turn and river (flop), every river (turn), none (river).
  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!hero.includes(c) && !board.includes(c)) deck.push(c);
  const need = 5 - board.length;
  const wins = new Float64Array(combos.length);
  const runs = new Float64Array(combos.length);

  const playOut = (runLo: number, runHi: number) => {
    const lo = boardLo | runLo;
    const hi = boardHi | runHi;
    const heroScore = evalPacked(heroLo | lo, heroHi | hi);
    for (let i = 0; i < combos.length; i++) {
      const v = combos[i]!;
      if ((v.lo & runLo) | (v.hi & runHi)) continue; // the runout uses one of villain's cards
      const s = evalPacked(v.lo | lo, v.hi | hi);
      wins[i]! += heroScore > s ? 1 : heroScore === s ? 0.5 : 0;
      runs[i]!++;
    }
  };

  if (need === 0) playOut(0, 0);
  else if (need === 1) for (const c of deck) playOut(CARD_LO[c]!, CARD_HI[c]!);
  else {
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        const a = deck[i]!;
        const b = deck[j]!;
        playOut(CARD_LO[a]! | CARD_LO[b]!, CARD_HI[a]! | CARD_HI[b]!);
      }
    }
  }
  combos.forEach((v, i) => (vsCombo[v.combo] = wins[i]! / runs[i]!));
  return summarise(combos, vsCombo, 'exact');
}

function summarise(combos: VillainCombo[], vsCombo: Float32Array, method: EquityResult['method']): EquityResult {
  let weight = 0;
  let sum = 0;
  for (const v of combos) {
    weight += v.weight;
    sum += v.weight * vsCombo[v.combo]!;
  }
  return { equity: weight > 0 ? sum / weight : NaN, vsCombo, combos: weight, method };
}

// ---------------------------------------------------------------------------------------------

export interface MonteCarloResult {
  equity: number;
  /** Standard error of the estimate (about ±2× this is the 95 % band). */
  stdError: number;
  samples: number;
}

/** Small seeded generator (mulberry32), so results can be repeated in tests. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hero against any number of villain ranges by sampling: each trial deals every villain a hand
 * from their range (by weight; a trial where two hands collide is dealt again, which keeps the
 * joint odds right) and the rest of the board at random.
 */
export function monteCarloEquity(
  hero: readonly Card[],
  board: readonly Card[],
  villains: readonly Weights[],
  { samples = 100_000, seed = 1 }: { samples?: number; seed?: number } = {},
): MonteCarloResult {
  checkCards(hero, board);
  if (villains.length === 0) throw new Error('At least one villain range');
  const random = rng(seed);
  const [heroLo, heroHi] = packed(hero);
  const [boardLo, boardHi] = packed(board);

  const ranges = villains.map((w) => {
    const list = liveCombos(w, heroLo | boardLo, heroHi | boardHi);
    if (list.length === 0) throw new Error('A villain range has no hands left after card removal');
    const cumulative = new Float64Array(list.length);
    let total = 0;
    list.forEach((v, i) => (cumulative[i] = total += v.weight));
    return { list, cumulative, total };
  });
  const pick = (r: (typeof ranges)[number]) => {
    const x = random() * r.total;
    let lo = 0;
    let hi = r.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r.cumulative[mid]! > x) hi = mid;
      else lo = mid + 1;
    }
    return r.list[lo]!;
  };

  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!hero.includes(c) && !board.includes(c)) deck.push(c);
  const need = 5 - board.length;
  const villainLo = new Int32Array(villains.length);
  const villainHi = new Int32Array(villains.length);

  let sum = 0;
  let sumSq = 0;
  let done = 0;
  let attempts = 0;
  while (done < samples) {
    if (++attempts > samples * 50) throw new Error('The ranges block each other too much to sample');
    // villains' hands
    let usedLo = heroLo | boardLo;
    let usedHi = heroHi | boardHi;
    let clash = false;
    for (let k = 0; k < ranges.length && !clash; k++) {
      const v = pick(ranges[k]!);
      if ((v.lo & usedLo) | (v.hi & usedHi)) clash = true;
      usedLo |= v.lo;
      usedHi |= v.hi;
      villainLo[k] = v.lo;
      villainHi[k] = v.hi;
    }
    if (clash) continue;
    // the rest of the board: draw from the deck, skipping cards in use
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
    const heroScore = evalPacked(heroLo | lo, heroHi | hi);
    let best = heroScore;
    let tied = 1;
    let heroAlive = true;
    for (let k = 0; k < ranges.length; k++) {
      const s = evalPacked(villainLo[k]! | lo, villainHi[k]! | hi);
      if (s > best) {
        best = s;
        heroAlive = false;
      } else if (s === best && heroAlive) tied++;
    }
    const share = heroAlive ? 1 / tied : 0;
    sum += share;
    sumSq += share * share;
    done++;
  }
  const mean = sum / samples;
  return { equity: mean, stdError: Math.sqrt(Math.max(0, sumSq / samples - mean * mean) / samples), samples };
}
