/**
 * Range building: sort hands into the buckets of a preflop spot.
 *   1 Facing an open  - one hand: 3-bet for value, 3-bet as a bluff, call or fold?
 *   2 Facing a 3-bet  - the same against a 3-bet: 4-bet for value, 4-bet as a bluff, call, fold
 *   3 Paint the chart - the whole 13×13 grid of a spot, scored on the share of combos you got right
 *
 * The reference is the library's charts (the ones the bots play). A chart only says raise / call /
 * fold; value or bluff is read from the chart itself, the polarised way: a raising hand that is
 * with several stronger hands that only call is a bluff (A5s 3-bets while 88-22 call: it raises for
 * the ace blocker and playability), the others are value. With no calls in the chart, the better half of the raises
 * is value.
 */

import type { LibraryRange } from '../ranges/library';
import { CELL_NAMES, CELLS } from '../ranges/hands';
import { HAND_RANKING } from '../ranges/ranking';
import { charts, clearAction } from './ranges';
import { newId, pick, type Question, type Rand } from './types';

export type PreflopBucket = 'value' | 'bluff' | 'call' | 'fold';

/** Where each cell stands in the ranking (0 = AA). */
const RANK_OF_CELL: number[] = (() => {
  const out = new Array<number>(CELLS).fill(CELLS);
  HAND_RANKING.forEach((cell, i) => (out[cell] = i));
  return out;
})();

/** Every cell's bucket by the chart's main action (null where the chart mixes evenly). */
export function chartBuckets(r: LibraryRange, strict = true): (PreflopBucket | null)[] {
  const main = (cell: number): 'raise' | 'call' | 'fold' | null => {
    if (strict) return clearAction(r, cell);
    const m = r.chart[cell]!;
    const raise = m.raise + m.allin;
    const fold = 100 - raise - m.call;
    return raise >= m.call && raise >= fold ? (raise > 0 ? 'raise' : 'fold') : m.call >= fold ? 'call' : 'fold';
  };
  const acts = Array.from({ length: CELLS }, (_, cell) => main(cell));
  const callRanks = acts.flatMap((a, cell) => (a === 'call' ? [RANK_OF_CELL[cell]!] : [])).sort((a, b) => a - b);
  const raiseRanks = acts.flatMap((a, cell) => (a === 'raise' ? [RANK_OF_CELL[cell]!] : [])).sort((a, b) => a - b);
  // a raise is a bluff when enough stronger hands only call (A5s 3-bets while 88-22 call)
  const enough = Math.max(3, Math.ceil(callRanks.length / 10));
  const half = raiseRanks[Math.floor((raiseRanks.length - 1) / 2)] ?? 0;
  const isValue = (cell: number) => {
    const rank = RANK_OF_CELL[cell]!;
    return callRanks.length ? callRanks.filter((c) => c < rank).length < enough : rank <= half;
  };
  return acts.map((a, cell) => (a === null ? null : a === 'raise' ? (isValue(cell) ? 'value' : 'bluff') : a));
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
  return { value: `${w} for value`, bluff: `${w} as a bluff`, call: 'Call', fold: 'Fold' };
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

function handQuestion(level: number, rand: Rand): Question {
  const pool = facingCharts(level);
  for (let guard = 0; guard < 80; guard++) {
    const r = pick(rand, pool);
    const buckets = chartBuckets(r);
    // aim at each bucket evenly, and at folds near the edge (not 72o)
    const want = pick(rand, ['value', 'bluff', 'call', 'fold'] as PreflopBucket[]);
    const lastPlayed = Math.max(...buckets.flatMap((b, cell) => (b && b !== 'fold' ? [RANK_OF_CELL[cell]!] : [0])));
    const cells = buckets.flatMap((b, cell) => (b === want && (want !== 'fold' || RANK_OF_CELL[cell]! <= lastPlayed + 25) ? [cell] : []));
    if (!cells.length) continue;
    const cell = pick(rand, cells);
    const labels = bucketLabels(r);
    const hand = CELL_NAMES[cell]!;
    const m = r.chart[cell]!;
    const hasCalls = buckets.some((b) => b === 'call');
    return {
      id: newId(rand),
      quiz: 'build',
      level,
      type: 'bucket-preflop',
      prompt: `${spotText(r)} (live, 100 BB) with ${hand}. Which bucket?`,
      data: { hand, cell, chart: r.label },
      choices: (['value', 'bluff', 'call', 'fold'] as PreflopBucket[]).filter((b) => b !== 'call' || hasCalls).map((b) => ({ id: b, label: labels[b] })),
      answer: { kind: 'choice', id: want },
      explain:
        `${r.label}: ${hand} ${m.raise + m.allin ? `raises ${m.raise + m.allin} %` : ''}${m.call ? `${m.raise + m.allin ? ', ' : ''}calls ${m.call} %` : ''}${m.raise + m.allin + m.call === 0 ? 'folds' : ''}. ` +
        (want === 'value'
          ? 'It raises and is as strong as the best calling hands: it wants to get called.'
          : want === 'bluff'
            ? 'It raises while stronger hands just call: it raises for the blockers and fold equity, and folds to more action.'
            : want === 'call'
              ? 'Too good to fold, not strong enough (or too good to fold out worse) to raise.'
              : 'Not in the range here: fold.'),
    };
  }
  throw new Error('no bucket question found');
}

function paintQuestion(level: number, rand: Rand): Question {
  const pool = [...charts('RFI'), ...charts('vs RFI CO'), ...charts('vs RFI BTN'), ...charts('vs RFI EP')];
  const r = pick(rand, pool);
  const buckets = chartBuckets(r, false).map((b) => b ?? 'fold');
  const labels = bucketLabels(r);
  const open = r.scenario === 'RFI';
  const used: PreflopBucket[] = open ? ['value', 'fold'] : (['value', 'bluff', 'call', 'fold'] as PreflopBucket[]).filter((b) => b === 'fold' || buckets.includes(b));
  // an opening chart has two buckets: open or fold
  const cells = open ? buckets.map((b) => (b === 'fold' || b === 'call' ? 'fold' : 'value')) : buckets;
  return {
    id: newId(rand),
    quiz: 'build',
    level,
    type: 'paint',
    prompt: `Paint the chart: ${spotText(r)} (live, 100 BB). Pick a bucket, then tap or drag over the hands.`,
    data: { grid: true, chart: r.label },
    choices: used.map((b) => ({ id: b, label: open && b === 'value' ? 'Open' : labels[b] })),
    answer: { kind: 'grid', cells, pass: 0.8 },
    explain: `${r.label}. Scored on the hands that matter: every combo the chart plays or you painted (offsuit hands count 12, suited 4, pairs 6); right at 80 %. Hands the chart mixes count for its most frequent action.`,
  };
}

export function buildQuestion(level: number, rand: Rand): Question {
  return level <= 2 ? handQuestion(level, rand) : paintQuestion(level, rand);
}
