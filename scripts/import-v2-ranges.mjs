// Converts LogiStack v2's preflop ranges (Django data dump) into src/core/ranges/library.json.
//
//   node scripts/import-v2-ranges.mjs ["path/to/datadump_utf8.json"]
//
// v2 stored each range as 169 "row-col" cells (row 0 = ace; above the diagonal suited) with
// {allin, raise, call} percentages. Here a cell is named ("AKs") and stored as [raise, call] or
// [raise, call, allin]; cells that always fold are left out.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = process.argv[2] ?? 'C:/Users/marius.dinu/Projects/LogiStack v2/backend/datadump_utf8.json';
const target = fileURLToPath(new URL('../src/core/ranges/library.json', import.meta.url));

const dump = JSON.parse(readFileSync(source, 'utf8'));
const objects = (model) => dump.filter((o) => o.model === model);
const names = (model) => new Map(objects(model).map((o) => [o.pk, o.fields.name]));

const positions = names('ranges.position');
const scenarios = names('ranges.preflopscenario');
const stacks = names('ranges.stackdepth');
const types = new Map(objects('ranges.playertype').map((o) => [o.pk, o.fields]));

const TEN_MAX = ['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const R = 'AKQJT98765432';
const cellName = (row, col) => (row === col ? R[row] + R[col] : row < col ? R[row] + R[col] + 's' : R[col] + R[row] + 'o');

const one = (list, what, label) => {
  if (list.length !== 1) throw new Error(`${label}: expected one ${what}, got ${list.length}`);
  return list[0];
};

const ranges = objects('ranges.pokerrange')
  .sort((a, b) => a.pk - b.pk)
  .map(({ pk, fields: f }) => {
    const type = types.get(one(f.player_types, 'player type', f.label));
    const cells = {};
    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 13; col++) {
        const v = f.range_data[`${row}-${col}`] ?? {};
        const mix = [v.raise ?? 0, v.call ?? 0, v.allin ?? 0];
        if (mix.some((x) => !Number.isFinite(x) || x < 0) || mix[0] + mix[1] + mix[2] > 100) {
          throw new Error(`${f.label}: bad cell ${row}-${col} ${JSON.stringify(v)}`);
        }
        if (mix.some((x) => x > 0)) cells[cellName(row, col)] = mix[2] ? mix : mix.slice(0, 2);
      }
    }
    return {
      id: `v2-${pk}`,
      label: f.label,
      scenario: scenarios.get(one(f.scenarios, 'scenario', f.label)),
      positions: f.positions.map((p) => positions.get(p)).sort((a, b) => TEN_MAX.indexOf(a) - TEN_MAX.indexOf(b)),
      stack: stacks.get(one(f.stack_depths, 'stack depth', f.label)),
      playerType: type.name,
      env: type.environment,
      cells,
    };
  });

const playerTypes = [...types.values()]
  .sort((a, b) => a.sort_order - b.sort_order)
  .map((t) => ({
    name: t.name,
    env: t.environment,
    parent: t.parent ? types.get(t.parent).name : null,
    sizingAggressiveness: t.sizing_aggressiveness,
  }));

// One range per line keeps the file readable and the diffs small.
const lines = [
  '{',
  `  "source": "LogiStack v2 data dump (backend/datadump_utf8.json, 2026-01-26); positions use 10-max names",`,
  `  "playerTypes": [`,
  playerTypes.map((t) => `    ${JSON.stringify(t)}`).join(',\n'),
  '  ],',
  '  "ranges": [',
  ranges.map((r) => `    ${JSON.stringify(r)}`).join(',\n'),
  '  ]',
  '}',
];
writeFileSync(target, lines.join('\n') + '\n');
console.log(`${ranges.length} ranges and ${playerTypes.length} player types written to ${target}`);
