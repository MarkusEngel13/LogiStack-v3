import { describe, expect, test } from 'vitest';
import marius from '../fixtures/players-2026-10-10.json';
import { STYLES } from '../motives/preflop';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import { classify, familiesOf, TYPE_FAMILY } from './classify';
import { applyAnswers } from './questions';
import { BASE_TYPES, SLIDERS, stylePreflop, typeSettings, type StyleSettings } from './style';
import { askOptions, upgradeAnswers } from './versions';

const charts: ChartChoice[] = LIBRARY.map((r) => ({ id: r.id, label: r.label, scenario: r.scenario, positions: r.positions, stack: r.stack, env: r.env, chart: r.chart }));
const preflopOf = (s: StyleSettings) => stylePreflop(s, STYLES);
const types = BASE_TYPES.map((t) => ({ name: t, settings: typeSettings(t) }));
const names = (xs: { name: string }[]) => xs.map((x) => x.name);
const players: Record<string, Record<string, string>> = marius.players;

/** His answers on the current questions (each ambiguous one as `pick` says, else the review's best guess), from Unknown. */
function styleOf(v1: Record<string, string>, pick: Record<string, number> = {}): StyleSettings {
  const { answers, asks } = upgradeAnswers(v1, 1);
  for (const a of asks) answers[a.q] = askOptions(a)[pick[a.q] ?? 0]!;
  return applyAnswers(answers, typeSettings('Unknown'), charts, preflopOf);
}

/** Every way the review can answer his ambiguous questions. */
function everyReview(v1: Record<string, string>): StyleSettings[] {
  const asks = upgradeAnswers(v1, 1).asks;
  let picks: Record<string, number>[] = [{}];
  for (const a of asks) picks = picks.flatMap((p) => askOptions(a).map((_, i) => ({ ...p, [a.q]: i })));
  return picks.map((p) => styleOf(v1, p));
}

describe('types: the family before the flop, then the postflop sliders', () => {
  test('every built-in type is itself; Unknown is never an answer', () => {
    for (const t of BASE_TYPES) expect(names(classify(typeSettings(t), types).best), t).toEqual(t === 'Unknown' ? ['Reg'] : [t]);
    expect(Object.keys(TYPE_FAMILY).sort()).toEqual(BASE_TYPES.filter((t) => t !== 'Unknown').sort());
  });

  test('Jansen is a TAG who c-bets a lot: tight before the flop, whatever his c-bets and bluffs', () => {
    for (const s of everyReview(players.Jansen!)) {
      expect(familiesOf(s.sliders)).toEqual(['tight-aggressive']);
      expect(names(classify(s, types).best)).toEqual(['TAG']);
    }
    // all seven sliders alike (the old way) made him a LAG
    const s = styleOf(players.Jansen!);
    const all = (t: string) => SLIDERS.reduce((d, id) => d + Math.abs(s.sliders[id] - typeSettings(t).sliders[id]), 0);
    expect(all('LAG')).toBeLessThan(all('TAG'));
    expect(s.sliders.cbet).toBe(5);
  });

  test('Michel is a LAG: loose and raising before the flop', () => {
    for (const s of everyReview(players.Michel!)) expect(names(classify(s, types).best)).toEqual(['LAG']);
  });

  test('the three fish (1 in 5 or 1 in 8 hands, fold to big river bets) are weak-tight recs', () => {
    for (const name of ['Olivier', 'Tommy', 'Oleksander']) {
      for (const s of everyReview(players[name]!)) {
        expect(familiesOf(s.sliders), name).toEqual(['tight-passive']);
        expect(names(classify(s, types).best), name).toEqual(['Weak-tight rec']);
      }
    }
  }, 30_000); // every review of three players: about 2 s alone, over 5 s while the whole suite runs

  test('a tie is shown, not broken by list order', () => {
    // a reg's preflop, c-bets between Reg (3) and TAG (3.5), bluffs as a reg: as near one as the other
    const s = { ...typeSettings('Reg'), sliders: { ...typeSettings('Reg').sliders, cbet: 3.5, bluffs: 1.5 } };
    const m = classify(s, types);
    expect(names(m.best).sort()).toEqual(['Reg', 'TAG']);
    const reversed = classify(s, [...types].reverse());
    expect(names(reversed.best).sort()).toEqual(['Reg', 'TAG']);
  });

  test('the runner-up is shown when it is close', () => {
    const jansen = classify(styleOf(players.Jansen!), types);
    expect(jansen.close?.name).toBe('Reg');
    expect(classify(typeSettings('Maniac'), types).close).toBeUndefined();
  });

  test('your profiles count too, in their own family; one on Unknown with moved sliders is a real style', () => {
    const mine = { name: 'Old man coffee', settings: { ...typeSettings('Nit'), sliders: { ...typeSettings('Nit').sliders, respect: 5, sticky: 1.5 } } };
    const s = { ...typeSettings('Nit'), sliders: { ...typeSettings('Nit').sliders, sticky: 1.5 } };
    expect(names(classify(s, [...types, mine]).best)).toEqual(['Old man coffee']);
    const pool = { name: 'My pool', settings: { ...typeSettings('Unknown'), sliders: { ...typeSettings('Unknown').sliders, bluffs: 1 } } };
    expect(names(classify(pool.settings, [...types, pool]).best)).toEqual(['My pool']);
  });
});
