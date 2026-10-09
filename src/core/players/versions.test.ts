import { describe, expect, test } from 'vitest';
import marius from '../fixtures/players-2026-10-10.json';
import { STYLES } from '../motives/preflop';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import { applyAnswers, QUESTIONS, QUESTIONS_VERSION } from './questions';
import { stylePreflop, typeSettings, type StyleSettings } from './style';
import { askOptions, moveAnswer, oldAnswerLabel, upgrade, upgradeAnswers } from './versions';

const charts: ChartChoice[] = LIBRARY.map((r) => ({ id: r.id, label: r.label, scenario: r.scenario, positions: r.positions, stack: r.stack, env: r.env, chart: r.chart }));
const preflopOf = (s: StyleSettings) => stylePreflop(s, STYLES);
const players: Record<string, Record<string, string>> = marius.players;
const asked = (name: string) => upgradeAnswers(players[name]!, 1).asks.map((a) => a.q).sort();
const reg = typeSettings('Reg');
const withSliders = (s: StyleSettings, sl: Partial<StyleSettings['sliders']>): StyleSettings => ({ ...s, sliders: { ...s.sliders, ...sl } });

describe('version 1 -> 2: answers', () => {
  test('clean moves happen by themselves, only the ambiguous answers are asked', () => {
    expect(QUESTIONS_VERSION).toBe(2);
    expect(asked('Jansen')).toEqual([]);
    expect(asked('Michel')).toEqual(['leads', 'open']);
    expect(asked('Olivier')).toEqual(['cbet', 'leads']);
    expect(asked('Tommy')).toEqual(['cbet']);
    expect(asked('Oleksander')).toEqual(['cbet', 'leads']);
    const j = upgradeAnswers(players.Jansen!, 1).answers;
    expect(j).toMatchObject({ open: '3-4', limpTrap: 'never', leads: 'never', cbet: 'every', threeBet: 'some', postflop: 'lots' });
    expect(upgradeAnswers({ open: '3', limpTrap: 'yes' }, 1).answers).toEqual({ open: '3-4', limpTrap: 'monster' });
  });

  test('every answer after the move is one of the current options (or a value told at the table)', () => {
    for (const a of Object.values(players)) {
      for (const [q, ans] of Object.entries(upgradeAnswers(a, 1).answers)) {
        expect(QUESTIONS.find((x) => x.id === q)!.options.map((o) => o.id), `${q}:${ans}`).toContain(ans);
      }
    }
    expect(upgradeAnswers({ hands: 'pct70' }, 1).answers).toEqual({ hands: 'pct70' });
  });

  test('the ambiguous ones: the choices, the best guess first, the old words', () => {
    const ask = (q: string, old: string) => askOptions({ q, old, from: 1 });
    expect(ask('open', '5')).toEqual(['5-6', '7+']);
    expect(ask('threeBet', 'never')).toEqual(['rarely', 'never']);
    expect(ask('leads', 'strong')).toEqual(['sometimes', 'rarely']);
    expect(ask('cbet', 'half')).toEqual(['mixed', 'less']);
    expect(oldAnswerLabel('open', '5', 1)).toBe('5 BB or more');
    expect(oldAnswerLabel('cbet', 'mixed', 2)).toBe('Mixed');
  });

  test('answers already on the current questions stay as they are', () => {
    expect(upgradeAnswers({ cbet: 'mixed' }, 2)).toEqual({ answers: { cbet: 'mixed' }, asks: [] });
  });
});

describe('version 1 -> 2: his settings', () => {
  test('sliders move by the change in meaning, so a slider tuned by hand keeps its tuning', () => {
    const s = withSliders(reg, { cbet: 2 }); // "about half" set C-bets 2
    expect(moveAnswer(s, 'cbet', 'half', 'mixed', {}, 1).sliders.cbet).toBe(3);
    expect(moveAnswer(s, 'cbet', 'half', 'less', {}, 1).sliders.cbet).toBe(2);
    expect(moveAnswer(withSliders(reg, { cbet: 2.5 }), 'cbet', 'half', 'mixed', {}, 1).sliders.cbet).toBe(3.5);
    // a raiser who "never" 3-bet was at 2.5: very rarely keeps him there, never moves him a step down
    const r = withSliders(reg, { pfAggr: 2.5 });
    expect(moveAnswer(r, 'threeBet', 'never', 'rarely', { firstIn: 'raise' }, 1).sliders.pfAggr).toBe(2.5);
    expect(moveAnswer(r, 'threeBet', 'never', 'never', { firstIn: 'raise' }, 1).sliders.pfAggr).toBe(2);
  });

  test('switches and the open size follow while they still have what the old answer set', () => {
    const old = { ...reg, leads: true, openBB: 5 } as unknown as StyleSettings; // saved as on/off
    expect(moveAnswer(old, 'leads', 'strong', 'rarely', {}, 1).leads).toBe(1);
    expect(moveAnswer(old, 'leads', 'strong', 'sometimes', {}, 1).leads).toBe(2);
    expect(moveAnswer(old, 'open', '5', '7+', {}, 1).openBB).toBe(8);
    expect(moveAnswer({ ...old, openBB: 6 }, 'open', '5', '7+', {}, 1).openBB).toBe(6); // set by hand
    const often = moveAnswer({ ...reg, leads: 2 }, 'leads', 'often', 'often', {}, 1);
    expect(often.leads).toBe(3);
    expect(moveAnswer({ ...reg, limpTrap: true } as unknown as StyleSettings, 'limpTrap', 'yes', 'monster', {}, 1).limpTrap).toBe(1);
  });

  test("Jansen moves cleanly: the same as answering the new questions, the raise size now 3-4 BB", () => {
    const now = upgradeAnswers(players.Jansen!, 1).answers;
    const fresh = applyAnswers(now, typeSettings('LAG'), charts, preflopOf);
    const saved = { ...fresh, openBB: 4 }; // what the old questions saved: open 4 = exactly 4 BB
    const moved = upgrade(saved, players.Jansen!, 1);
    expect(moved.asks).toEqual([]);
    expect(moved.settings).toEqual(fresh);
    expect(moved.settings.openBB).toBe(3.5);
  });

  test('ambiguous answers leave his settings alone until the review', () => {
    const s = { ...withSliders(reg, { cbet: 2 }), leads: 2 as const };
    const moved = upgrade(s, players.Olivier!, 1);
    expect(moved.settings.sliders.cbet).toBe(2);
    expect(moved.settings.leads).toBe(2);
    expect(moved.answers.cbet).toBeUndefined();
    expect(moved.answers.limpTrap).toBe('monster');
  });

  test('nothing moves on the current version', () => {
    const s = withSliders(reg, { cbet: 2 });
    expect(moveAnswer(s, 'cbet', 'less', 'mixed', {}, 2)).toBe(s);
  });
});
