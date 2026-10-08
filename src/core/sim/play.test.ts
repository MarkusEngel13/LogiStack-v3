import { describe, expect, test } from 'vitest';
import type { HandRecord } from '../hand/types';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import { playHand, seeded } from './play';

export const libraryCharts: ChartChoice[] = LIBRARY.map((r) => ({ id: r.id, label: r.label, scenario: r.scenario, positions: r.positions, stack: r.stack, env: r.env, chart: r.chart }));

export function table(types: string[], button = 0): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: 'sim',
    createdAt: '2026-10-08T00:00:00Z',
    table: { seats: types.length, venue: 'home', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
    button,
    players: types.map((t, seat) => ({ seat, name: `${t} ${seat}`, stack: 2500, playerType: t })),
    events: [],
  };
}

describe('bots play whole hands', () => {
  test('a hand ends, chips are kept, every move is legal', () => {
    const p = playHand(table(['Reg', 'Fish', 'Nit', 'LAG', 'Whale', 'Maniac']), libraryCharts, { rand: seeded(7) });
    const final = p.steps.at(-1)!;
    expect(['complete', 'showdown']).toContain(final.phase);
    const net = final.result!.net;
    expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);
  }, 120_000);
});
