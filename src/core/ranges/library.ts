/**
 * The preflop range library: v2's 60 charts (scripts/import-v2-ranges.mjs → library.json).
 * Positions in the library use 10-max names; chartPosition() maps a seat at any table size to the
 * 10-max seat with the same number of players still to act behind it.
 */

import data from './library.json';
import { chartFromCells, type Chart, type ChartCells } from './range';

export const SCENARIOS = [
  'RFI',
  'vs Limp',
  'vs RFI EP',
  'vs RFI MP',
  'vs RFI CO',
  'vs RFI BTN',
  'vs RFI SB',
  'IP vs 3Bet',
  'OOP vs 3Bet',
  'vs 4Bet',
  'Squeeze',
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const TEN_MAX_POSITIONS = ['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const;

export interface LibraryRange {
  id: string;
  label: string;
  scenario: Scenario;
  /** 10-max names. */
  positions: string[];
  stack: string;
  playerType: string;
  env: 'Live' | 'Online';
  chart: Chart;
}

export interface PlayerTypeInfo {
  name: string;
  env: 'Live' | 'Online';
  parent: string | null;
  sizingAggressiveness: number;
}

interface LibraryFile {
  playerTypes: PlayerTypeInfo[];
  ranges: (Omit<LibraryRange, 'chart'> & { cells: ChartCells })[];
}

const file = data as unknown as LibraryFile;

export const LIBRARY: readonly LibraryRange[] = file.ranges.map(({ cells, ...r }) => ({ ...r, chart: chartFromCells(cells) }));
export const PLAYER_TYPES: readonly PlayerTypeInfo[] = file.playerTypes;

export function findRanges(q: { scenario?: Scenario; position?: string; stack?: string; env?: 'Live' | 'Online' }): LibraryRange[] {
  return LIBRARY.filter(
    (r) =>
      (q.scenario === undefined || r.scenario === q.scenario) &&
      (q.position === undefined || r.positions.includes(q.position)) &&
      (q.stack === undefined || r.stack === q.stack) &&
      (q.env === undefined || r.env === q.env),
  );
}

const MIDDLE_10 = TEN_MAX_POSITIONS.slice(0, 7); // UTG .. CO

/**
 * The 10-max position with as many players behind as `position` has at a table where
 * `playersDealt` players were dealt in: at 9-max, UTG plays like the 10-max UTG+1 (eight behind).
 * Blinds, button, LJ, HJ and CO keep their names.
 */
export function chartPosition(position: string, playersDealt: number): string {
  const m = /^UTG(?:\+(\d))?$/.exec(position);
  if (!m) return position;
  const middleSeats = playersDealt - 3; // everyone but SB, BB, BTN
  const index = Number(m[1] ?? 0); // 0 for UTG, 1 for UTG+1, ...
  return MIDDLE_10[MIDDLE_10.length - middleSeats + index] ?? position;
}
