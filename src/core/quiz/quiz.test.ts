import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards';
import { dailySet, defaultState, levelUp, streak, updateReview, type Attempt, type DayRecord } from './daily';
import { combosLeft, drawsOn, drawsQuestionFor, outs } from './draws';
import { mathsQuestion } from './maths';
import { rangesQuestion } from './ranges';
import { CHIP_PRESETS, geometricBet, makeChips, stackQuestion, stackUp, valueOf } from './stack';
import { grade, QUIZZES, QUIZ_INFO, seeded } from './types';

const c = (t: string) => parseCards(t.split(' '));
const home = CHIP_PRESETS[0]!;

describe('guess the stack', () => {
  it('the cashier gives the amount in chips, and the towers hold them all', () => {
    const rand = seeded(1);
    for (let i = 0; i < 50; i++) {
      const amount = (10 + i * 7) * 25;
      const chips = makeChips(home, amount, rand);
      // about the amount (a 25 can leave 5 cents no chip pays); the questions use the chips' own sum
      expect(amount - valueOf(home, chips)).toBeGreaterThanOrEqual(0);
      expect(amount - valueOf(home, chips)).toBeLessThan(25);
      for (const style of ['neat', 'human', 'nervous', 'slob'] as const) {
        const scene = stackUp(chips, style, rand);
        const n = scene.rows.flat().reduce((t, x) => t + x.chips.length, 0) + scene.loose.length;
        expect(n).toBe(chips.length);
        if (style === 'neat') expect(scene.rows.flat().every((t) => t.chips.length <= 20 && new Set(t.chips).size === 1)).toBe(true);
      }
    }
  });

  it('every level makes a question its answer fits', () => {
    const rand = seeded(7);
    for (let level = 1; level <= 5; level++) {
      for (let i = 0; i < 20; i++) {
        const q = stackQuestion(home, level, rand);
        const a = q.answer;
        const given = a.kind === 'choice' ? { kind: 'choice' as const, id: a.id } : a.kind === 'number' ? { kind: 'number' as const, value: a.value } : { kind: 'multi' as const, ids: a.ids };
        expect(grade(q, given).correct).toBe(true);
        if (level === 1) expect(q.choices).toHaveLength(5);
      }
    }
  });

  it('the dirty stack: the answer counts the hidden chip', () => {
    const rand = seeded(3);
    const q = stackQuestion(home, 3, rand);
    const scene = (q.data.scenes as { rows: { chips: number[] }[][]; loose: { chip: number }[] }[])[0]!;
    const counted = scene.rows.flat().reduce((t, x) => t + x.chips.reduce((s, i) => s + home.chips[i]!.value, 0), 0) + scene.loose.reduce((t, l) => t + home.chips[l.chip]!.value, 0);
    expect(q.answer).toMatchObject({ kind: 'number', value: counted, tolerance: 0 });
  });

  it('geometric bets: pot 100, stack 800, two streets', () => {
    // the pot ends at 100 + 2 × 800 = 1700: grow by √17 a street
    expect(geometricBet(100, 800, 2)).toBeCloseTo((100 * (Math.sqrt(17) - 1)) / 2, 6);
  });
});

describe('table maths, ranges, draws', () => {
  it('every generator answers its own question', () => {
    const rand = seeded(11);
    for (let level = 1; level <= 3; level++) {
      for (let i = 0; i < 15; i++) {
        for (const q of [mathsQuestion({ currency: home.currency, blinds: home.blinds }, level, rand), rangesQuestion(level, rand), drawsQuestionFor(level, rand)]) {
          const a = q.answer;
          const given = a.kind === 'choice' ? { kind: 'choice' as const, id: a.id } : a.kind === 'number' ? { kind: 'number' as const, value: a.value } : { kind: 'multi' as const, ids: a.ids };
          expect(grade(q, given).correct, q.prompt).toBe(true);
          expect(q.explain.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it('pot odds: a pot-sized bet needs a third', () => {
    const g = { currency: home.currency, blinds: home.blinds };
    const rand = seeded(5);
    for (let i = 0; i < 30; i++) {
      const q = mathsQuestion(g, 1, rand);
      if (q.type !== 'pot-odds') continue;
      const { pot, bet } = q.data as { pot: number; bet: number };
      expect((q.answer as { value: number }).value).toBeCloseTo((100 * bet) / (pot + 2 * bet), 0);
    }
  });

  it('outs: a flush draw against an overpair on a dry board', () => {
    // A♠K♠ against Q♥Q♦ on J♠7♠2♦: 9 spades, 3 aces, 3 kings
    const o = outs(c('As Ks'), c('Qh Qd'), c('Js 7s 2d'));
    expect(o.length).toBe(15);
  });

  it('draws on a board, combos with blockers', () => {
    expect(drawsOn(c('Kd 7c 2h'))).toEqual(['none']);
    expect(drawsOn(c('9h 8h 2c'))).toEqual(['flush', 'open', 'gutshot']);
    expect(combosLeft('AK', [])).toBe(16);
    expect(combosLeft('AK', c('As Kd'))).toBe(9);
    expect(combosLeft('QQ', c('Qs'))).toBe(3);
    expect(combosLeft('77', c('7s 7h'))).toBe(1);
  });
});

describe('the routine', () => {
  it('the day\'s set: ten questions, the same on every device, missed ones come back', () => {
    const st = defaultState();
    const a = dailySet('2026-10-10', st);
    const b = dailySet('2026-10-10', st);
    expect(a).toHaveLength(10);
    expect(a.map((q) => q.prompt)).toEqual(b.map((q) => q.prompt));
    const missed = a[0]!;
    const withReview = { ...st, review: updateReview([], { ...missed, id: 'old' }, false) };
    expect(dailySet('2026-10-11', withReview).some((q) => q.id === 'old')).toBe(true);
    expect(updateReview(withReview.review, { ...missed, id: 'old' }, true)).toEqual([]);
  });

  it('levels go up after 8 of the last 10', () => {
    const at = (correct: boolean): Attempt => ({ at: '', qid: 'x', quiz: 'maths', type: 't', level: 1, correct, ms: 1, given: { kind: 'number', value: 1 } });
    expect(levelUp([...Array(8).fill(at(true)), at(false), at(false)], 'maths', 1)).toBe(2);
    expect(levelUp([...Array(7).fill(at(true)), at(false), at(false), at(false)], 'maths', 1)).toBeNull();
    expect(levelUp(Array(10).fill(at(true)), 'maths', QUIZ_INFO.maths.levels)).toBeNull();
  });

  it('the streak counts finished days in a row', () => {
    const day = (date: string, done: boolean): DayRecord => {
      const set = dailySet(date, defaultState()).slice(0, 2);
      return { id: `day:${date}`, date, set, attempts: done ? set.map((q) => ({ at: '', qid: q.id, quiz: q.quiz, type: q.type, level: 1, correct: true, ms: 1, given: { kind: 'number', value: 0 }, daily: true })) : [] };
    };
    const days = [day('2026-10-07', true), day('2026-10-08', true), day('2026-10-09', true), day('2026-10-10', false)];
    expect(streak(days, '2026-10-10')).toBe(3);
    expect(streak([...days.slice(0, 3), day('2026-10-10', true)], '2026-10-10')).toBe(4);
    expect(streak([day('2026-10-07', true)], '2026-10-10')).toBe(0);
    expect(QUIZZES).toHaveLength(4);
  });
});
