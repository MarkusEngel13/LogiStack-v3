import { describe, expect, test } from 'vitest';
import { cellByName } from '../../core/ranges/hands';
import { LIBRARY } from '../../core/ranges/library';
import { chartFromCells, emptyChart, type Chart } from '../../core/ranges/range';
import { copyLabel, copyOfLibrary, sameChart, savedMine } from './draft';
import type { MyRange } from './myRanges';

const lib = LIBRARY[0]!;
const painted = (chart: Chart, hand: string, mix = { raise: 100, call: 0, allin: 0 }) => {
  const next = chart.slice();
  next[cellByName(hand)!] = mix;
  return next;
};

describe('the Unsaved pill', () => {
  test('a stroke makes the draft differ, painting it back makes it match again', () => {
    const saved = lib.chart;
    const draft = painted(saved, '72o', { raise: 0, call: 50, allin: 0 });
    expect(sameChart(draft, saved)).toBe(false);
    expect(sameChart(painted(draft, '72o', saved[cellByName('72o')!]!), saved)).toBe(true);
  });

  test('a fresh copy of the same chart matches', () => {
    expect(sameChart(emptyChart(), emptyChart())).toBe(true);
    expect(sameChart(lib.chart.map((m) => ({ ...m })), lib.chart)).toBe(true);
  });

  test('each action counts, not only the painted share', () => {
    const a = painted(emptyChart(), 'AKs', { raise: 50, call: 50, allin: 0 });
    const b = painted(emptyChart(), 'AKs', { raise: 50, call: 0, allin: 50 });
    expect(sameChart(a, b)).toBe(false);
  });

  test('what Save stores reads back as the same chart (no pill right after saving)', () => {
    const draft = painted(painted(lib.chart, 'K9o', { raise: 35, call: 40, allin: 0 }), 'AA', { raise: 0, call: 0, allin: 100 });
    const stored = copyOfLibrary(lib, draft, 'Test', 'id-1', '2026-10-10T00:00:00.000Z');
    expect(sameChart(chartFromCells(stored.cells), draft)).toBe(true);
  });
});

describe('Save', () => {
  test('a library chart becomes a new chart of yours, under the name given', () => {
    const draft = painted(lib.chart, '72o');
    const copy = copyOfLibrary(lib, draft, '  CO open, wider  ', 'id-2', '2026-10-10T00:00:00.000Z');
    expect(copy).toMatchObject({
      id: 'id-2',
      label: 'CO open, wider',
      scenario: lib.scenario,
      positions: lib.positions,
      stack: lib.stack,
      env: lib.env,
      playerType: lib.playerType,
      basedOn: lib.id,
      updatedAt: '2026-10-10T00:00:00.000Z',
    });
    expect(copy.cells['72o']).toEqual([100, 0]);
  });

  test('a blank name falls back to "… (mine)"', () => {
    expect(copyLabel('CO RFI')).toBe('CO RFI (mine)');
    expect(copyOfLibrary(lib, lib.chart, '   ', 'id-3', 'now').label).toBe(`${lib.label} (mine)`);
  });

  test('your chart keeps its id, name and spot; only the cells and the time change', () => {
    const existing: MyRange = {
      id: 'mine-1',
      label: 'My CO',
      scenario: lib.scenario,
      positions: lib.positions,
      stack: lib.stack,
      env: lib.env,
      playerType: lib.playerType,
      cells: { AA: [100, 0] },
      basedOn: lib.id,
      updatedAt: 'before',
    };
    const saved = savedMine(existing, painted(emptyChart(), 'KK', { raise: 0, call: 100, allin: 0 }), 'after');
    expect(saved).toEqual({ ...existing, cells: { KK: [0, 100] }, updatedAt: 'after' });
  });
});
