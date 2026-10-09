import { expect, test } from 'vitest';
import { typeSettings } from '../players/style';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import { playHand, seeded } from './play';
import { playSimHands, simHand, type SimTable } from './table';

const charts: ChartChoice[] = LIBRARY.map((r) => ({ id: r.id, label: r.label, scenario: r.scenario, positions: r.positions, stack: r.stack, env: r.env, chart: r.chart }));
const pool = ['Reg', 'Fish', 'Nit', 'Whale'].map((t) => ({ name: t, type: t }));
const passive = { ...typeSettings('Reg'), sliders: { ...typeSettings('Reg').sliders, cbet: 1, bluffs: 1 } };
const wild = { ...typeSettings('Reg'), sliders: { ...typeSettings('Reg').sliders, cbet: 5, bluffs: 5, postAggr: 5 } };
const A: SimTable = { seed: 1, seats: [{ name: 'Hero', type: 'Reg', style: { label: 'A', settings: passive } }, ...pool] };
const B: SimTable = { seed: 1, seats: [{ name: 'Hero', type: 'Reg', style: { label: 'B', settings: wild } }, ...pool] };

test('two runs that differ in one seat see the same cards', () => {
  for (let i = 0; i < 6; i++) {
    const a = playHand(simHand(A, i), charts, { rand: seeded(1 + i), dealRand: seeded(7_919 * i + 13) });
    const b = playHand(simHand(B, i), charts, { rand: seeded(1 + i), dealRand: seeded(7_919 * i + 13) });
    expect(a.hand.players.map((p) => p.cards)).toEqual(b.hand.players.map((p) => p.cards));
    const boards = (h: typeof a) => h.hand.events.filter((e) => e.type === 'board').map((e) => (e as { cards: string[] }).cards.join(''));
    const n = Math.min(boards(a).length, boards(b).length);
    expect(boards(a).slice(0, n)).toEqual(boards(b).slice(0, n));
  }
}, 120_000);

test('a batch counts every seat and gives seat 0 a result per hand', () => {
  const r = playSimHands(A, 0, 4, charts);
  expect(Object.keys(r.counts).sort()).toEqual(['0', '1', '2', '3', '4']);
  expect(r.counts['0']!.hands).toBe(4);
  expect(r.nets).toHaveLength(4);
  expect(r.nets.reduce((s, x) => s + x, 0)).toBeCloseTo(r.counts['0']!.netBB);
}, 120_000);
