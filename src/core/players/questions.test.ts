import { describe, expect, test } from 'vitest';
import { STYLES } from '../motives/preflop';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import { classify } from './classify';
import { answerLabel, applyAnswers, handsPlayed, looseFor, openBand, openBBOf, QUESTIONS, tablePositions } from './questions';
import { at, BASE_TYPES, stylePreflop, typeSettings } from './style';

const charts: ChartChoice[] = LIBRARY.map((r) => ({ id: r.id, label: r.label, scenario: r.scenario, positions: r.positions, stack: r.stack, env: r.env, chart: r.chart }));
const preflopOf = (s: Parameters<typeof stylePreflop>[0]) => stylePreflop(s, STYLES);
const unknown = typeSettings('Unknown');
const apply = (a: Record<string, string>, start = unknown) => applyAnswers(a, start, charts, preflopOf);

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
    expect(apply({}, typeSettings('Fish'))).toEqual(typeSettings('Fish'));
  });

  test('a typical fish, from what you saw', () => {
    const s = apply({ table: '9', hands: 'most', firstIn: 'limp', threeBet: 'never', postflop: 'passive', sticky: 'down', respect: 'calls', bluffs: 'never', sizing: 'strength' });
    expect(s.sliders.loose).toBeGreaterThanOrEqual(4);
    expect(s.sliders.pfAggr).toBe(1);
    expect(s.sliders.sticky).toBe(4);
    expect(s.sizing).toBe('payoff');
    const profiles = BASE_TYPES.map((t) => ({ name: t, settings: typeSettings(t) }));
    const best = classify(s, profiles).best.map((p) => p.name);
    expect(best).toHaveLength(1);
    expect(['Fish', 'Whale']).toContain(best[0]);
  });

  test('raises first in and 3-bets often = aggressive preflop; specials', () => {
    const s = apply({ firstIn: 'raise', threeBet: 'often', limpTrap: 'monster', leads: 'sometimes' });
    expect(s.sliders.pfAggr).toBe(4.5);
    expect(s.limpTrap).toBe(1);
    expect(s.leads).toBe(2);
    expect(at('raises', s.sliders.pfAggr)).toBeGreaterThan(1);
  });

  test('3-bets: never, very rarely, sometimes, often - one step each for a raiser', () => {
    const pf = (threeBet: string, firstIn = 'raise') => apply({ firstIn, threeBet }).sliders.pfAggr;
    expect(['never', 'rarely', 'some', 'often'].map((x) => pf(x))).toEqual([2, 2.5, 3, 4.5]);
    expect(['never', 'rarely', 'some', 'often'].map((x) => pf(x, 'mix'))).toEqual([1.5, 2, 2, 3]);
    expect(pf('never', 'limp')).toBe(1);
  });

  test('raise size: the bands open about in their middle; a size told at the table is exact', () => {
    expect(['2', '3-4', '5-6', '7+'].map((o) => apply({ open: o }).openBB)).toEqual([2, 3.5, 5.5, 8]);
    expect(apply({ open: '2.5' }).openBB).toBe(2.5);
    expect(openBBOf('x')).toBeUndefined();
    expect([2, 2.5, 3, 4, 5, 6, 7, 10].map(openBand)).toEqual(['2', '2', '3-4', '3-4', '5-6', '5-6', '7+', '7+']);
    expect(answerLabel('open', '2.5')).toBe('2.5 BB');
    expect(answerLabel('hands', 'pct70')).toBe('70 % of hands');
  });

  test('raise size by hand', () => {
    expect(apply({ openTell: 'strong' }).openTell).toBe('strong');
    expect(apply({ openTell: 'weak' }).openTell).toBe('weak');
    expect(apply({ openTell: 'no' }, { ...unknown, openTell: 'strong' }).openTell).toBe('no');
  });

  test('limp-reraise and donk-bet levels', () => {
    expect(['never', 'monster', 'often'].map((x) => apply({ limpTrap: x }).limpTrap)).toEqual([0, 1, 2]);
    expect(['never', 'rarely', 'sometimes', 'often'].map((x) => apply({ leads: x }).leads)).toEqual([0, 1, 2, 3]);
    expect(apply({ leads: 'often' }).sliders.postAggr).toBe(3.5);
    expect(apply({ leads: 'sometimes' }).sliders.postAggr).toBe(unknown.sliders.postAggr);
  });

  test('c-bets: five steps, the mixed one in the middle', () => {
    expect(['hits', 'less', 'mixed', 'flop', 'every'].map((x) => apply({ cbet: x }).sliders.cbet)).toEqual([1, 2, 3, 4, 5]);
  });

  test('the question about bets without the initiative leaves the c-bet spot out', () => {
    const q7 = QUESTIONS.find((q) => q.id === 'postflop')!;
    expect(q7.text).toMatch(/did not raise before the flop, or you bet into him/);
    expect(q7.options.find((o) => o.id === 'fair')).toMatchObject({ label: 'Average', hint: 'bets when he has something, sometimes a bluff' });
  });
});

test('c-bets every street', () => {
  const s = apply({ cbet: 'every', postflop: 'passive' });
  expect(s.sliders.cbet).toBe(5);
  expect(s.sliders.postAggr).toBe(1.5);
});
