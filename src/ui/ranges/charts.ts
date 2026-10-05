import { LIBRARY } from '../../core/ranges/library';
import { chartFromCells } from '../../core/ranges/range';
import type { ChartChoice } from '../../core/ranges/spot';
import { loadMyRanges } from './myRanges';

/** Every chart the Lab can use: the library and yours (yours win for the same spot). */
export function allCharts(): ChartChoice[] {
  return [
    ...LIBRARY.map((r) => ({ id: r.id, label: r.label, scenario: r.scenario, positions: r.positions, stack: r.stack, env: r.env, chart: r.chart })),
    ...loadMyRanges().map((m) => ({
      id: m.id,
      label: m.label,
      scenario: m.scenario,
      positions: m.positions,
      stack: m.stack,
      env: m.env,
      chart: chartFromCells(m.cells),
      mine: true,
    })),
  ];
}
