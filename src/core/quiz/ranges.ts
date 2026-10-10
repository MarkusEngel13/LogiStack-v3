/**
 * Ranges:
 *   1 Opening charts   - does a Reg open this hand from this seat (live, 100 BB)?
 *   2 Facing an open   - fold, call or 3-bet, by the chart?
 *   3 Equity on a flop - your hand against his: guess your equity
 * The charts are the library's (the same the bots play); only hands the chart plays one way most
 * of the time are asked (no coin flips), and mostly hands near the edge of the range.
 */

import { cardToString, prettyCard, type Card } from '../cards';
import { equityVsRange } from '../equity/equity';
import { LIBRARY, type LibraryRange } from '../ranges/library';
import { CELL_NAMES } from '../ranges/hands';
import { HAND_RANKING } from '../ranges/ranking';
import { comboIndex } from '../cards';
import { emptyWeights } from '../ranges/range';
import { newId, pick, shuffled, type Question, type Rand } from './types';

const POS_NAME: Record<string, string> = { 'UTG+3': 'LJ' };

/** The chart's clear action for a cell, or null when it mixes. (Charts hold percents.) */
export function clearAction(r: LibraryRange, cell: number): 'raise' | 'call' | 'fold' | null {
  const m = r.chart[cell]!;
  const raise = (m.raise + m.allin) / 100;
  const call = m.call / 100;
  const fold = 1 - raise - call;
  if (raise >= 0.7) return 'raise';
  if (call >= 0.7) return 'call';
  if (fold >= 0.7) return 'fold';
  return null;
}

/** A hand near the edge of the range: in the ranking, within a window around where playing stops. */
function edgeCell(r: LibraryRange, rand: Rand): number | null {
  const plays = (cell: number) => clearAction(r, cell) !== 'fold';
  const order = HAND_RANKING;
  let edge = order.findIndex((cell) => !plays(cell));
  if (edge < 0) edge = order.length - 1;
  const lo = Math.max(0, edge - 22);
  const hi = Math.min(order.length - 1, edge + 22);
  const window = order.slice(lo, hi + 1).filter((cell) => clearAction(r, cell) !== null);
  return window.length ? pick(rand, window) : null;
}

export const charts = (scenario: string) => LIBRARY.filter((r) => r.scenario === scenario && r.env === 'Live' && r.stack === '100BB');

function chartQuestion(level: number, rand: Rand): Question {
  for (let guard = 0; guard < 50; guard++) {
    const facing = level === 2;
    const pool = facing ? [...charts('vs RFI BTN'), ...charts('vs RFI CO'), ...charts('vs RFI EP')] : charts('RFI');
    const r = pick(rand, pool);
    const cell = edgeCell(r, rand);
    if (cell === null) continue;
    const act = clearAction(r, cell)!;
    const pos = r.positions.map((p) => POS_NAME[p] ?? p).filter((p, i, xs) => xs.indexOf(p) === i).join('/');
    const hand = CELL_NAMES[cell]!;
    const opener = r.scenario.replace('vs RFI ', '');
    const prompt = facing
      ? `A Reg in the ${pos} faces an open from ${opener === 'EP' ? 'early position' : `the ${opener}`} (live, 100 BB) with ${hand}. What does the chart do?`
      : `A Reg is first in from the ${pos} (live, 100 BB) with ${hand}. Does he open?`;
    const choices = facing
      ? [
          { id: 'fold', label: 'Fold' },
          { id: 'call', label: 'Call' },
          { id: 'raise', label: '3-bet' },
        ]
      : [
          { id: 'raise', label: 'Open (raise)' },
          { id: 'fold', label: 'Fold' },
        ];
    if (!choices.some((c) => c.id === act)) continue;
    const m = r.chart[cell]!;
    const share = (x: number) => `${Math.round(x)} %`;
    return {
      id: newId(rand),
      quiz: 'ranges',
      level,
      type: facing ? 'facing' : 'open',
      prompt,
      data: { hand, cell, chart: r.label },
      choices,
      answer: { kind: 'choice', id: act },
      explain: `The chart (${r.label}): ${hand} raises ${share(m.raise + m.allin)}${m.call ? `, calls ${share(m.call)}` : ''}, folds ${share(Math.max(0, 100 - m.raise - m.allin - m.call))}.`,
    };
  }
  throw new Error('no chart question found');
}

const weightsOf = (cards: readonly Card[]) => {
  const w = emptyWeights();
  w[comboIndex(cards[0]!, cards[1]!)] = 1;
  return w;
};

function equityQuestion(level: number, rand: Rand): Question {
  for (let guard = 0; guard < 50; guard++) {
    const deck = shuffled(rand, Array.from({ length: 52 }, (_, c) => c));
    const hero = deck.slice(0, 2);
    const villain = deck.slice(2, 4);
    const board = deck.slice(4, 7);
    const eq = equityVsRange(hero, board, weightsOf(villain)).equity;
    if (!Number.isFinite(eq) || eq < 0.04 || eq > 0.96) continue;
    const pct = Math.round(eq * 1000) / 10;
    return {
      id: newId(rand),
      quiz: 'ranges',
      level,
      type: 'equity',
      prompt: 'Both hands are face up on the flop. What is your equity (win, plus half the ties)?',
      data: { hero: hero.map(cardToString), villain: villain.map(cardToString), board: board.map(cardToString) },
      unit: '%',
      answer: { kind: 'number', value: pct, tolerance: 8 },
      explain: `Exactly ${pct} % over every turn and river. ${hero.map(prettyCard).join('')} against ${villain.map(prettyCard).join('')}: count your outs and use the rule of 4 to get close fast.`,
    };
  }
  throw new Error('no equity question found');
}

export function rangesQuestion(level: number, rand: Rand): Question {
  return level <= 2 ? chartQuestion(level, rand) : equityQuestion(level, rand);
}
