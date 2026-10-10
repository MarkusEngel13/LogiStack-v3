/**
 * Range building: sort hands into the buckets of a preflop spot.
 *   1 Facing an open  - one hand: 3-bet for value, 3-bet merged, 3-bet as a bluff, call or fold?
 *   2 Facing a 3-bet  - a step up: 4-bet for value, 4-bet as a bluff, call or fold?
 *   3 Paint the chart - the whole 13×13 grid of a spot in the chart's own words (raise, call,
 *                       fold), scored on the share of combos you got right
 *
 * The reference is the library's charts (the ones the bots play). A chart only says raise / call /
 * fold; why a hand raises is read from the charts:
 * - facing an open, from the 3-bettor's chart against a 4-bet ("vs 4Bet"; a seat without one
 *   borrows the nearest, as the bots do): a 3-bet that goes on against a 4-bet (calls or jams) is
 *   value; one that folds and is stronger than most hands that only call is merged (thin value,
 *   protection); one that folds and is weaker than most of the calls is a bluff.
 * - facing a 3-bet (there is no chart for a 5-bet), the polarised way: a 4-bet with several
 *   stronger hands that only call is a bluff (it raises for the blockers), the others are value.
 * Only clear cases are asked: no mixed hands, none at the border between two buckets.
 */

import type { LibraryRange } from '../ranges/library';
import { CELL_NAMES, CELLS } from '../ranges/hands';
import type { ActionMix } from '../ranges/range';
import { HAND_RANKING } from '../ranges/ranking';
import { pickChart } from '../ranges/spot';
import { charts, clearAction } from './ranges';
import { newId, pick, type Question, type Rand } from './types';

export type PreflopBucket = 'value' | 'merged' | 'bluff' | 'call' | 'fold';
/** A chart's own words. */
export type ChartWord = 'raise' | 'call' | 'fold';

/** Where each cell stands in the ranking (0 = AA). */
const RANK_OF_CELL: number[] = (() => {
  const out = new Array<number>(CELLS).fill(CELLS);
  HAND_RANKING.forEach((cell, i) => (out[cell] = i));
  return out;
})();

/** The chart's most frequent action for a cell (a tie goes to the more active one). */
function mainAction(r: LibraryRange, cell: number): ChartWord {
  const m = r.chart[cell]!;
  const raise = m.raise + m.allin;
  const fold = 100 - raise - m.call;
  return raise >= m.call && raise >= fold ? (raise > 0 ? 'raise' : 'fold') : m.call >= fold ? 'call' : 'fold';
}

/** The 3-bettor's chart against a 4-bet: his seat's, or the nearest seat's (as the bots pick it). */
export function fourBetChart(r: LibraryRange): LibraryRange | null {
  const all = charts('vs 4Bet');
  const best = pickChart(all, 'vs 4Bet', r.positions[0] ?? '', 100);
  return all.find((c) => c.id === best?.id) ?? null;
}

/** What a hand does against a 4-bet: goes on (calls or jams, 70 %+), folds (70 %+), or mixes (null). */
function against4Bet(f4: LibraryRange, cell: number): 'on' | 'fold' | null {
  const m = f4.chart[cell]!;
  const on = m.raise + m.allin + m.call;
  return on >= 70 ? 'on' : on <= 30 ? 'fold' : null;
}

/** With fewer calls than this, a chart can't tell a merged 3-bet from a bluff. */
const MIN_CALLS = 5;

/** Every cell's bucket (null: not a clear case - the chart mixes, or the hand sits at a border). */
export function chartBuckets(r: LibraryRange): (PreflopBucket | null)[] {
  const acts = Array.from({ length: CELLS }, (_, cell) => clearAction(r, cell));
  const callRanks = acts.flatMap((a, cell) => (a === 'call' ? [RANK_OF_CELL[cell]!] : []));
  const facingOpen = r.scenario.startsWith('vs RFI');
  const f4 = facingOpen ? fourBetChart(r) : null;
  // facing a 3-bet: a bluff when more stronger hands only call than this
  const several = Math.max(3, Math.ceil(callRanks.length / 10));
  return acts.map((a, cell) => {
    if (a !== 'raise') return a;
    const stronger = callRanks.filter((c) => c < RANK_OF_CELL[cell]!).length;
    if (!facingOpen) return stronger <= 1 ? 'value' : stronger > several ? 'bluff' : null;
    const vs = f4 ? against4Bet(f4, cell) : null;
    if (vs === 'on') return 'value';
    if (vs === null || callRanks.length < MIN_CALLS) return null;
    const weaker = 1 - stronger / callRanks.length;
    return weaker >= 2 / 3 ? 'merged' : weaker <= 1 / 3 ? 'bluff' : null;
  });
}

/** The chart in its own words, cell by cell (an opening chart: open or fold). Mixed cells take the most frequent action. */
export function paintCells(r: LibraryRange): ChartWord[] {
  return Array.from({ length: CELLS }, (_, cell) => {
    const a = mainAction(r, cell);
    return r.scenario === 'RFI' && a === 'call' ? 'fold' : a;
  });
}

const facingCharts = (level: number) =>
  level === 1
    ? ['vs RFI EP', 'vs RFI MP', 'vs RFI CO', 'vs RFI BTN', 'vs RFI SB'].flatMap((s) => charts(s))
    : ['IP vs 3Bet', 'OOP vs 3Bet'].flatMap((s) => charts(s)).filter((r) => !r.positions.includes('BB'));

const POS_NAME: Record<string, string> = { 'UTG+3': 'LJ' };
const positions = (r: LibraryRange) => [...new Set(r.positions.map((p) => POS_NAME[p] ?? p))].join('/');

/** "3-bet" facing an open, "4-bet" facing a 3-bet. */
const raiseWord = (r: LibraryRange) => (r.scenario.includes('3Bet') ? '4-bet' : r.scenario === 'RFI' ? 'Open' : '3-bet');

export function bucketLabels(r: LibraryRange): Record<PreflopBucket, string> {
  const w = raiseWord(r);
  return { value: `${w} for value`, merged: `${w} merged (thin value / protection)`, bluff: `${w} as a bluff`, call: 'Call', fold: 'Fold' };
}

function spotText(r: LibraryRange): string {
  const pos = positions(r);
  if (r.scenario === 'RFI') return `${r.playerType} first in from the ${pos}`;
  if (r.scenario.startsWith('vs RFI ')) {
    const opener = r.scenario.replace('vs RFI ', '');
    return `${r.playerType} in the ${pos} facing an open from ${opener === 'EP' ? 'early position' : opener === 'MP' ? 'middle position' : `the ${opener}`}`;
  }
  return `${r.playerType} opened from the ${pos} and faces a 3-bet ${r.scenario.startsWith('IP') ? '(in position)' : '(out of position)'}`;
}

const pct = (x: number) => `${Math.round(x)} %`;

/** "raises 75 %, folds 25 %" in the words given (just "folds" when it always folds). */
function mixText(m: ActionMix, [raises, calls, folds]: [string, string, string]): string {
  const raise = m.raise + m.allin;
  const fold = Math.max(0, 100 - raise - m.call);
  if (fold >= 100) return folds;
  return [raise ? `${raises} ${pct(raise)}` : '', m.call ? `${calls} ${pct(m.call)}` : '', fold ? `${folds} ${pct(fold)}` : ''].filter(Boolean).join(', ');
}

/** A few hands by name, best first. */
const names = (ranks: number[]) => ranks.slice(0, 3).map((rank) => CELL_NAMES[HAND_RANKING[rank]!]!).join(', ');

interface Case {
  r: LibraryRange;
  cell: number;
  bucket: PreflopBucket;
}

const casesByLevel = new Map<number, Case[]>();

/** Every clear case of a level (folds only near the edge of the range, not 72o). */
function cases(level: number): Case[] {
  let out = casesByLevel.get(level);
  if (!out) {
    out = facingCharts(level).flatMap((r) => {
      const buckets = chartBuckets(r);
      const lastPlayed = Math.max(0, ...Array.from({ length: CELLS }, (_, cell) => (mainAction(r, cell) !== 'fold' ? RANK_OF_CELL[cell]! : 0)));
      return buckets.flatMap((bucket, cell) => (bucket && (bucket !== 'fold' || RANK_OF_CELL[cell]! <= lastPlayed + 25) ? [{ r, cell, bucket }] : []));
    });
    casesByLevel.set(level, out);
  }
  return out;
}

function handQuestion(level: number, rand: Rand): Question {
  const all = cases(level);
  const order: PreflopBucket[] = level === 1 ? ['value', 'merged', 'bluff', 'call', 'fold'] : ['value', 'bluff', 'call', 'fold'];
  const groups = order.map((b) => all.filter((c) => c.bucket === b));
  // aim at each bucket evenly, less often at one with only a few clear hands (they would repeat)
  const weights = groups.map((g) => Math.min(g.length, 10));
  let x = rand() * weights.reduce((t, w) => t + w, 0);
  const group = groups.find((_, i) => (x -= weights[i]!) < 0) ?? groups[0]!;
  const { r, cell, bucket } = pick(rand, group);

  const labels = bucketLabels(r);
  const hand = CELL_NAMES[cell]!;
  const buckets = chartBuckets(r);
  const hasCalls = buckets.some((b) => b === 'call');
  const rank = RANK_OF_CELL[cell]!;
  const callRanks = buckets.flatMap((b, c) => (b === 'call' ? [RANK_OF_CELL[c]!] : [])).sort((a, b) => a - b);
  const stronger = callRanks.filter((c) => c < rank);
  const weaker = callRanks.filter((c) => c > rank);
  const f4 = level === 1 ? fourBetChart(r) : null;
  // "the BB's chart against a 4-bet says call 75 %, fold 25 %"
  const f4Says = f4
    ? `the ${positions(f4)}'s chart against a 4-bet${positions(f4) !== positions(r) ? ` (the ${positions(r)} has none)` : ''} says ${mixText(f4.chart[cell]!, ['5-bet all-in', 'call', 'fold'])}`
    : '';

  const why: Record<PreflopBucket, string> = {
    value: f4
      ? `Against a 4-bet it goes on: ${f4Says}. It 3-bets to get the money in: value.`
      : `It 4-bets, and ${stronger.length ? `only ${names(stronger)} (stronger) just calls` : 'no stronger hand just calls'}: a 4-bet for value - it wants to get called.`,
    merged: `Against a 4-bet it folds - ${f4Says} - but it is stronger than ${weaker.length} of the ${callRanks.length} hands that only call (${names(weaker)}): a merged 3-bet, thin value against the worse hands that call and protection (it takes the pot now or plays the flop heads-up with the lead).`,
    bluff: f4
      ? `Against a 4-bet it folds - ${f4Says} - and ${stronger.length} of the ${callRanks.length} hands that only call are stronger (${names(stronger)}): a 3-bet bluff, for the fold equity and the blockers, not to get called.`
      : `It 4-bets while ${stronger.length} stronger hands only call (${names(stronger)}): a 4-bet bluff - it raises for the blockers and the fold equity, not to get called.`,
    call: 'Too good to fold, not strong enough (or too good to fold out worse) to raise.',
    fold: 'Not in the range here: fold.',
  };

  return {
    id: newId(rand),
    quiz: 'build',
    level,
    type: 'bucket-preflop',
    prompt: `${spotText(r)} (live, 100 BB) with ${hand}. Which bucket?`,
    data: { hand, cell, chart: r.label },
    choices: order.filter((b) => b !== 'call' || hasCalls).map((b) => ({ id: b, label: labels[b] })),
    answer: { kind: 'choice', id: bucket },
    explain: `${r.label}: ${hand} ${mixText(r.chart[cell]!, ['raises', 'calls', 'folds'])}. ${why[bucket]}`,
  };
}

const WORDS: Record<ChartWord, string> = { raise: 'Raise', call: 'Call', fold: 'Fold' };

function paintQuestion(level: number, rand: Rand): Question {
  const pool = [...charts('RFI'), ...charts('vs RFI CO'), ...charts('vs RFI BTN'), ...charts('vs RFI EP')];
  const r = pick(rand, pool);
  const cells = paintCells(r);
  const open = r.scenario === 'RFI';
  // an opening chart has two buckets: open or fold
  const used: ChartWord[] = open ? ['raise', 'fold'] : (['raise', 'call', 'fold'] as ChartWord[]).filter((b) => b === 'fold' || cells.includes(b));
  return {
    id: newId(rand),
    quiz: 'build',
    level,
    type: 'paint',
    prompt: `Paint the chart: ${spotText(r)} (live, 100 BB). Pick a bucket, then tap or drag over the hands.`,
    data: { grid: true, chart: r.label },
    choices: used.map((b) => ({ id: b, label: open && b === 'raise' ? 'Open' : WORDS[b] })),
    answer: { kind: 'grid', cells, pass: 0.8 },
    explain: `${r.label}, in the chart's own words (value, merged or bluff is for the one-hand questions). Scored on the hands that matter: every combo the chart plays or you painted (offsuit hands count 12, suited 4, pairs 6); right at 80 %. Hands the chart mixes count for its most frequent action.`,
  };
}

export function buildQuestion(level: number, rand: Rand): Question {
  return level <= 2 ? handQuestion(level, rand) : paintQuestion(level, rand);
}
