/**
 * The stats run: bots of every built-in type at one table, hand after hand, each hand's counts
 * appended to a log as soon as it is played - so a run can be stopped any time, read any time
 * (REPORT), and resumed (it skips the hands already in the log). Hand i always gets the same
 * cards and choices (seed = i), so a resumed or split run is the same run.
 *
 *   SIM=1 HANDS=2000 SHARD=0 SHARDS=2 LOG=stats.jsonl npx vitest run src/core/sim/run.test.ts
 *   REPORT=1 LOG=stats.jsonl npx vitest run src/core/sim/run.test.ts
 *
 * Stacks start at 100 BB every hand; the button moves one seat per hand.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import type { HandRecord } from '../hand/types';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import type { StoryCache } from '../motives/story';
import { playHand, seeded } from './play';
import { addCounts, countHand, emptyCounts, formatReport, type Counts } from './stats';

const TYPES = ['Reg', 'TAG', 'LAG', 'Nit', 'Fish', 'Whale', 'Maniac'];
const charts: ChartChoice[] = LIBRARY.map((r) => ({ id: r.id, label: r.label, scenario: r.scenario, positions: r.positions, stack: r.stack, env: r.env, chart: r.chart }));

function table(i: number): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: `sim-${i}`,
    createdAt: '2026-10-09T00:00:00Z',
    table: { seats: TYPES.length, venue: 'home', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
    button: i % TYPES.length,
    players: TYPES.map((t, seat) => ({ seat, name: t, stack: 2500, playerType: t })),
    events: [],
  };
}

const env = process.env;
const LOG = env.LOG ?? 'stats.jsonl';

test.runIf(env.SIM)('play and log', () => {
  const hands = Number(env.HANDS ?? 2000);
  const shard = Number(env.SHARD ?? 0);
  const shards = Number(env.SHARDS ?? 1);
  const done = new Set<number>();
  if (existsSync(LOG)) for (const l of readFileSync(LOG, 'utf8').split('\n')) if (l) done.add((JSON.parse(l) as { i: number }).i);
  const cache: StoryCache = new Map();
  for (let i = shard; i < hands; i += shards) {
    if (done.has(i)) continue;
    const t0 = performance.now();
    const p = playHand(table(i), charts, { rand: seeded(1000 + i), cache });
    const counts = countHand(p.steps.at(-1)!, (seat) => TYPES[seat]!);
    appendFileSync(LOG, JSON.stringify({ i, ms: Math.round(performance.now() - t0), counts: Object.fromEntries(counts) }) + '\n');
  }
}, 86_400_000);

test.runIf(env.REPORT)('report', () => {
  const groups = new Map<string, Counts>();
  let n = 0;
  let ms = 0;
  for (const file of LOG.split(',')) {
    if (!existsSync(file)) continue;
    for (const l of readFileSync(file, 'utf8').split('\n')) {
      if (!l) continue;
      const row = JSON.parse(l) as { ms: number; counts: Record<string, Counts> };
      n++;
      ms += row.ms;
      for (const [k, c] of Object.entries(row.counts)) groups.set(k, addCounts(groups.get(k) ?? emptyCounts(), c));
    }
  }
  const text = formatReport(groups, `Bot stats: ${n} hands, ${TYPES.length}-handed, 100 BB (avg ${n ? (ms / n / 1000).toFixed(1) : 0} s a hand)`);
  if (env.OUT) writeFileSync(env.OUT, text + '\n');
  console.log(text);
});
