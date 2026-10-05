/**
 * Range text, as used by Equilab, Flopzilla and most range sites:
 *
 *   AA, KK          single hands            AKs, AKo, AK    suited, offsuit, both
 *   TT+             TT and every pair above  ATs+, KTo+      kicker up to just below the top card
 *   99-66, A5s-A2s  from one hand to another KQs-87s         connectors stepping down together
 *   AhKh            one exact combo          KQo:0.5         weight (0.5 = half the combos; 50 also works)
 *
 * Items are separated by commas or spaces; a later item overrides an earlier one.
 */

import { cardsFromComboIndex, cardToString, comboIndex, rankOf, RANK_CHARS } from '../cards';
import { CELLS, cellKind, cellOf, cellRanks, combosOfCell } from './hands';
import { cellWeights, emptyWeights, type Weights } from './range';

export class RangeSyntaxError extends Error {
  constructor(public readonly token: string, why: string) {
    super(`"${token}": ${why}`);
  }
}

interface HandClass {
  hi: number;
  lo: number;
  /** true suited, false offsuit, null both (a pair has no suit choice either). */
  suited: boolean | null;
}

const rankAt = (text: string, i: number, token: string) => {
  const r = RANK_CHARS.indexOf((text[i] ?? '').toUpperCase());
  if (r < 0) throw new RangeSyntaxError(token, `"${text[i] ?? ''}" is not a rank`);
  return r;
};

function parseClass(text: string, token: string): HandClass {
  if (text.length < 2 || text.length > 3) throw new RangeSyntaxError(token, 'expected a hand like AKs, AKo, AK or TT');
  const a = rankAt(text, 0, token);
  const b = rankAt(text, 1, token);
  const suffix = text[2]?.toLowerCase();
  if (suffix !== undefined && suffix !== 's' && suffix !== 'o') throw new RangeSyntaxError(token, 'only "s" or "o" can follow the ranks');
  if (a === b) {
    if (suffix) throw new RangeSyntaxError(token, 'a pair is neither suited nor offsuit');
    return { hi: a, lo: a, suited: null };
  }
  return { hi: Math.max(a, b), lo: Math.min(a, b), suited: suffix === undefined ? null : suffix === 's' };
}

function cellsOf(h: HandClass): number[] {
  if (h.hi === h.lo) return [cellOf(h.hi, h.lo, false)];
  if (h.suited === null) return [cellOf(h.hi, h.lo, true), cellOf(h.hi, h.lo, false)];
  return [cellOf(h.hi, h.lo, h.suited)];
}

/** Every hand from one class to another (either order). */
function between(a: HandClass, b: HandClass, token: string): HandClass[] {
  const pairs = a.hi === a.lo && b.hi === b.lo;
  if (pairs) {
    const out: HandClass[] = [];
    for (let r = Math.min(a.hi, b.hi); r <= Math.max(a.hi, b.hi); r++) out.push({ hi: r, lo: r, suited: null });
    return out;
  }
  if (a.hi === a.lo || b.hi === b.lo || a.suited !== b.suited) {
    throw new RangeSyntaxError(token, 'both ends must be the same kind of hand');
  }
  if (a.hi === b.hi) {
    const out: HandClass[] = [];
    for (let k = Math.min(a.lo, b.lo); k <= Math.max(a.lo, b.lo); k++) out.push({ hi: a.hi, lo: k, suited: a.suited });
    return out;
  }
  if (a.hi - a.lo === b.hi - b.lo) {
    const gap = a.hi - a.lo;
    const out: HandClass[] = [];
    for (let h = Math.min(a.hi, b.hi); h <= Math.max(a.hi, b.hi); h++) out.push({ hi: h, lo: h - gap, suited: a.suited });
    return out;
  }
  throw new RangeSyntaxError(token, 'the two ends need the same top card or the same gap');
}

function parseWeight(text: string, token: string): number {
  const v = Number(text.replace('%', '').replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(v) || v < 0) throw new RangeSyntaxError(token, 'the weight must be a number');
  return Math.min(1, v > 1 || text.includes('%') ? v / 100 : v);
}

/** Combo indices of one item without its weight. */
function combosOfItem(item: string, token: string): number[] {
  if (/^[2-9tjqka][shdc][2-9tjqka][shdc]$/i.test(item)) {
    const card = (i: number) => 'shdc'.indexOf(item[i + 1]!.toLowerCase()) * 13 + rankAt(item, i, token);
    const [x, y] = [card(0), card(2)];
    if (x === y) throw new RangeSyntaxError(token, 'the same card twice');
    return [comboIndex(x, y)];
  }
  let classes: HandClass[];
  if (item.endsWith('+')) {
    const h = parseClass(item.slice(0, -1), token);
    if (h.hi === h.lo) classes = between(h, { hi: 12, lo: 12, suited: null }, token);
    else classes = between(h, { hi: h.hi, lo: h.hi - 1, suited: h.suited }, token);
  } else if (item.includes('-')) {
    const [from, to, extra] = item.split('-');
    if (extra !== undefined || !from || !to) throw new RangeSyntaxError(token, 'a range needs exactly two ends');
    classes = between(parseClass(from, token), parseClass(to, token), token);
  } else {
    classes = [parseClass(item, token)];
  }
  return classes.flatMap(cellsOf).flatMap(combosOfCell);
}

export function parseRange(text: string): Weights {
  const w = emptyWeights();
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const [item = '', weightText, extra] = token.split(':');
    if (extra !== undefined) throw new RangeSyntaxError(token, 'only one ":" per item');
    const weight = weightText === undefined ? 1 : parseWeight(weightText, token);
    for (const combo of combosOfItem(item, token)) w[combo] = weight;
  }
  return w;
}

// ---------------------------------------------------------------------------------------------

const rankChar = (r: number) => RANK_CHARS[r]!;

function formatWeight(w: number): string {
  return w >= 1 ? '' : `:${Number(w.toFixed(2))}`;
}

/** Consecutive runs (ascending) of a sorted list of ranks. */
function runs(ranks: number[]): number[][] {
  const out: number[][] = [];
  for (const r of [...ranks].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && last.at(-1) === r - 1) last.push(r);
    else out.push([r]);
  }
  return out;
}

/** Compact text for a set of cells: pairs, then suited and offsuit hands by top card. */
function formatCells(cells: number[]): string[] {
  const out: string[] = [];
  const pairs = cells.filter((c) => cellKind(c) === 'pair').map((c) => cellRanks(c)[0]);
  for (const run of runs(pairs).reverse()) {
    const lo = run[0]!;
    const hi = run.at(-1)!;
    const p = (r: number) => rankChar(r) + rankChar(r);
    out.push(hi === 12 && run.length > 1 ? `${p(lo)}+` : run.length === 1 ? p(lo) : `${p(hi)}-${p(lo)}`);
  }
  for (const suffix of ['s', 'o'] as const) {
    for (let hi = 12; hi >= 1; hi--) {
      const kickers = cells
        .filter((c) => cellKind(c) === (suffix === 's' ? 'suited' : 'offsuit') && cellRanks(c)[0] === hi)
        .map((c) => cellRanks(c)[1]);
      for (const run of runs(kickers).reverse()) {
        const lo = run[0]!;
        const top = run.at(-1)!;
        const h = (k: number) => rankChar(hi) + rankChar(k) + suffix;
        out.push(top === hi - 1 && run.length > 1 ? `${h(lo)}+` : run.length === 1 ? h(lo) : `${h(top)}-${h(lo)}`);
      }
    }
  }
  return out;
}

/** Range text for combo weights, grouped by weight (full weight first). */
export function formatRange(weights: Weights): string {
  const perCell = cellWeights(weights);
  const groups = new Map<number, number[]>();
  const singles: string[] = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const w = perCell[cell];
    if (w === null) {
      // combos of this cell differ: list them one by one
      for (const combo of combosOfCell(cell)) {
        const cw = weights[combo]!;
        if (cw > 0) singles.push(comboText(combo) + formatWeight(cw));
      }
    } else if (w! > 0) {
      const key = Number(w!.toFixed(4));
      groups.set(key, [...(groups.get(key) ?? []), cell]);
    }
  }
  const parts = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([w, cells]) => formatCells(cells).map((t) => t + formatWeight(w)));
  return [...parts, ...singles].join(', ');
}

function comboText(combo: number): string {
  const [a, b] = cardsFromComboIndex(combo);
  // higher rank first; a pair in suit order (s, h, d, c)
  const aFirst = rankOf(a) !== rankOf(b) ? rankOf(a) > rankOf(b) : a < b;
  return aFirst ? cardToString(a) + cardToString(b) : cardToString(b) + cardToString(a);
}
