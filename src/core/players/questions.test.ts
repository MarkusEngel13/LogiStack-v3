import { describe, expect, test } from 'vitest';
import { STYLES } from '../motives/preflop';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import { applyAnswers, handsPlayed, looseFor, nearest, tablePositions } from './questions';
import { at, BASE_TYPES, stylePreflop, typeSettings } from './style';

const charts: ChartChoice[] = LIBRARY.map((r) => ({ id: r.id, label: r.label, scenario: r.scenario, positions: r.positions, stack: r.stack, env: r.env, chart: r.chart }));
const preflopOf = (s: Parameters<typeof stylePreflop>[0]) => stylePreflop(s, STYLES);
const unknown = typeSettings('Unknown');

describe('hands played and table size', () => {
  test('the seats of a table', () => {
    expect(tablePositions(6)).toEqual(['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    expect(tablePositions(9)).toEqual(['UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
  });

  test('a solid player plays more hands six-handed than nine-handed', () => {
    const reg = STYLES.Reg!;
    expect(handsPlayed(reg, charts, 6)).toBeGreaterThan(handsPlayed(reg, charts, 9) + 0.03);
  });

  test('the same share of hands is looser at a full table', () => {
    const reg = STYLES.Reg!;
    expect(looseFor(0.3, reg, charts, 9)).toBeGreaterThan(looseFor(0.3, reg, charts, 6));
  });

  test('looser answers, looser slider', () => {
    const v = [0.12, 0.2, 0.32, 0.5, 0.7].map((x) => looseFor(x, STYLES.Reg!, charts, 9));
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]!);
    expect(v[4]).toBeGreaterThan(v[0]!);
  });
});

describe('answers', () => {
  test("don't know keeps the starting profile", () => {
    expect(applyAnswers({}, typeSettings('Fish'), charts, preflopOf)).toEqual(typeSettings('Fish'));
  });

  test('a typical fish, from what you saw', () => {
    const s = applyAnswers(
      { table: '9', hands: 'most', firstIn: 'limp', threeBet: 'never', postflop: 'passive', sticky: 'down', respect: 'calls', bluffs: 'never', sizing: 'strength' },
      unknown,
      charts,
      preflopOf,
    );
    expect(s.sliders.loose).toBeGreaterThanOrEqual(4);
    expect(s.sliders.pfAggr).toBe(1);
    expect(s.sliders.sticky).toBe(4);
    expect(s.sizing).toBe('payoff');
    const profiles = BASE_TYPES.map((t) => ({ name: t, settings: typeSettings(t) }));
    expect(['Fish', 'Whale']).toContain(nearest(s, profiles)!.name);
  });

  test('raises first in and 3-bets often = aggressive preflop; specials', () => {
    const s = applyAnswers({ firstIn: 'raise', threeBet: 'often', limpTrap: 'yes', leads: 'strong' }, unknown, charts, preflopOf);
    expect(s.sliders.pfAggr).toBe(4.5);
    expect(s.limpTrap).toBe(true);
    expect(s.leads).toBe(true);
    expect(at('raises', s.sliders.pfAggr)).toBeGreaterThan(1);
  });
});
