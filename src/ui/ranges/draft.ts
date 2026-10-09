import { chartToCells, type Chart } from '../../core/ranges/range';
import type { MyRange } from './myRanges';

/*
 * The range editor paints a draft. Nothing is stored until Save: the saved chart (the library's,
 * or yours as stored) is what Discard goes back to and what the Unsaved pill compares with.
 */

/** True when two charts paint every cell the same. */
export const sameChart = (a: Chart, b: Chart) =>
  a.length === b.length &&
  a.every((m, cell) => {
    const o = b[cell]!;
    return m.raise === o.raise && m.call === o.call && m.allin === o.allin;
  });

/** The name Save offers for your copy of a library chart. */
export const copyLabel = (label: string) => `${label} (mine)`;

/** Save on your own chart: same id and name, the draft's cells. */
export const savedMine = (existing: MyRange, chart: Chart, now: string): MyRange => ({ ...existing, cells: chartToCells(chart), updatedAt: now });

/** The spot a chart is for, as the library and your charts both carry it. */
type Spot = Pick<MyRange, 'scenario' | 'positions' | 'stack' | 'env' | 'playerType'>;

/**
 * Save on a library chart: a new chart of yours with the draft's cells, under the name given
 * (blank = "… (mine)"). The library chart itself never changes.
 */
export function copyOfLibrary(lib: Spot & { id: string; label: string }, chart: Chart, label: string, id: string, now: string): MyRange {
  return {
    id,
    label: label.trim() || copyLabel(lib.label),
    scenario: lib.scenario,
    positions: lib.positions,
    stack: lib.stack,
    env: lib.env,
    playerType: lib.playerType,
    cells: chartToCells(chart),
    basedOn: lib.id,
    updatedAt: now,
  };
}
