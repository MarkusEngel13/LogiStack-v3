import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards';
import { isQuizItemId } from '../../shared/plans';
import {
  addRecent,
  allLines,
  dailySet,
  defaultState,
  fullState,
  levelUp,
  RECENT_PER_QUIZ,
  statsOf,
  streak,
  tidyQuiz,
  updateReview,
  type Answered,
  type Attempt,
  type DayLine,
  type DayRecord,
  type QuizHistory,
  type QuizItem,
  type QuizState,
} from './daily';
import { combosLeft, drawsOn, drawsQuestionFor, outs } from './draws';
import { mathsQuestion } from './maths';
import { rangesQuestion } from './ranges';
import { CHIP_PRESETS, geometricBet, makeChips, stackQuestion, stackUp, valueOf } from './stack';
import { boardQuestion } from './board';
import { buildQuestion, chartBuckets, fourBetChart, paintCells } from './build';
import { cellByName } from '../ranges/hands';
import { readsQuestion } from './reads';
import { charts, clearAction } from './ranges';
import { grade, QUIZZES, QUIZ_INFO, rightAnswer, seeded, type Question } from './types';

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
        expect(grade(q, rightAnswer(q)).correct).toBe(true);
        if (level === 1) expect(q.choices).toHaveLength(5);
      }
    }
  });

  /** The value of the chips the question draws. */
  const drawn = (q: ReturnType<typeof stackQuestion>) => {
    const scene = (q.data.scenes as { rows: { chips: number[] }[][]; loose: { chip: number }[] }[])[0]!;
    return scene.rows.flat().reduce((t, x) => t + x.chips.reduce((s, i) => s + home.chips[i]!.value, 0), 0) + scene.loose.reduce((t, l) => t + home.chips[l.chip]!.value, 0);
  };

  it('the dirty stack: the answer counts the hidden chip', () => {
    const q = stackQuestion(home, 3, seeded(3));
    expect(q.answer).toMatchObject({ kind: 'number', value: drawn(q), tolerance: 0 });
  });

  it('the answer is always what the drawing shows (messy stacks with chips of the next tower on top too)', () => {
    const rand = seeded(17);
    for (let i = 0; i < 3000; i++) {
      const q = stackQuestion(home, 2 + (i % 2), rand);
      expect((q.answer as { value: number }).value).toBe(drawn(q));
    }
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
          expect(grade(q, rightAnswer(q)).correct, q.prompt).toBe(true);
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

describe('range building, the board, reads', () => {
  it('every generator answers its own question, at every level', () => {
    const rand = seeded(21);
    for (let i = 0; i < 6; i++) {
      for (let level = 1; level <= QUIZ_INFO.build.levels; level++) {
        const q = buildQuestion(level, rand);
        expect(grade(q, rightAnswer(q)).correct, q.prompt).toBe(true);
        if (q.answer.kind === 'choice') expect(q.choices!.some((c) => c.id === (q.answer as { id: string }).id)).toBe(true);
      }
      for (let level = 1; level <= QUIZ_INFO.board.levels; level++) {
        const q = boardQuestion(level, rand);
        expect(grade(q, rightAnswer(q)).correct, q.prompt).toBe(true);
        expect(q.explain.length).toBeGreaterThan(10);
      }
      for (let level = 1; level <= QUIZ_INFO.reads.levels; level++) {
        const q = readsQuestion(home, level, rand);
        expect(grade(q, rightAnswer(q)).correct).toBe(true);
      }
      for (let level = 4; level <= 4; level++) {
        const q = mathsQuestion({ currency: home.currency, blinds: home.blinds }, level, rand);
        expect(grade(q, rightAnswer(q)).correct).toBe(true);
      }
    }
  }, 60_000);

  it('charts are in percent: a 50/50 hand is never a clear action', () => {
    const utg = charts('RFI').find((r) => r.positions.includes('HJ'))!;
    const mixed = utg.chart.findIndex((m) => m.raise === 50);
    if (mixed >= 0) expect(clearAction(utg, mixed)).toBeNull();
    expect(clearAction(utg, 0)).toBe('raise'); // AA
  });

  const chart = (scenario: string, pos: string) => charts(scenario).find((r) => r.positions.includes(pos))!;
  const bucketOf = (scenario: string, pos: string, hand: string) => chartBuckets(chart(scenario, pos))[cellByName(hand)!];

  it('facing an open: value goes on against a 4-bet, merged folds above the calls, a bluff folds below them', () => {
    // the BB against the button: KQs calls a 4-bet (value); TT, AQo, AJs fold to one but beat
    // nearly every hand that only calls (merged)
    expect(bucketOf('vs RFI BTN', 'BB', 'AA')).toBe('value');
    expect(bucketOf('vs RFI BTN', 'BB', 'KQs')).toBe('value');
    for (const hand of ['TT', 'AQo', 'AJs']) expect(bucketOf('vs RFI BTN', 'BB', hand)).toBe('merged');
    expect(bucketOf('vs RFI BTN', 'BB', '88')).toBe('call');
    // the button against early position: A4s folds to a 4-bet while 77-55 and most suited connectors only call
    expect(bucketOf('vs RFI EP', 'BTN', 'A4s')).toBe('bluff');
    // against middle position: AJo folds to a 4-bet in the middle of the calls (99-55, JTs, QTs): not asked
    expect(bucketOf('vs RFI MP', 'BTN', 'AJo')).toBeNull();
    expect(bucketOf('vs RFI MP', 'BTN', 'KQo')).toBe('bluff');
    // a mixed hand is never asked
    expect(bucketOf('vs RFI BTN', 'BB', '99')).toBeNull();
  });

  it('facing an open: a seat without a chart against a 4-bet borrows the nearest; no calls, no merged or bluff', () => {
    expect(fourBetChart(chart('vs RFI EP', 'CO'))!.positions).toEqual(['HJ']);
    expect(fourBetChart(chart('vs RFI BTN', 'BB'))!.positions).toEqual(['BB']);
    // the button 3-bets or folds against the CO: what folds to a 4-bet can't be told merged or bluff
    const b = chartBuckets(chart('vs RFI CO', 'BTN'));
    expect(b.includes('call')).toBe(false);
    expect(b.some((x) => x === 'merged' || x === 'bluff')).toBe(false);
    expect(b[cellByName('KJo')!]).toBeNull();
  });

  it('facing a 3-bet: a 4-bet with several stronger hands only calling is a bluff', () => {
    expect(bucketOf('IP vs 3Bet', 'BTN', 'AA')).toBe('value');
    expect(bucketOf('IP vs 3Bet', 'BTN', 'KQo')).toBe('bluff');
    expect(bucketOf('IP vs 3Bet', 'BTN', 'AJs')).toBe('call');
    expect(bucketOf('OOP vs 3Bet', 'SB', 'AJo')).toBe('bluff');
    expect(chartBuckets(chart('OOP vs 3Bet', 'SB')).includes('merged')).toBe(false);
  });

  it('every bucket question has its answer among the choices and says why', () => {
    const rand = seeded(8);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const q = buildQuestion(1 + (i % 2), rand);
      const id = (q.answer as { id: string }).id;
      seen.add(`${q.level}:${id}`);
      expect(q.choices!.map((c) => c.id)).toContain(id);
      if (q.level === 2) expect(q.choices!.some((c) => c.id === 'merged')).toBe(false);
      if (id === 'merged' || (q.level === 1 && id === 'bluff')) expect(q.explain).toContain('hands that only call');
    }
    for (const b of ['value', 'merged', 'bluff', 'call', 'fold']) expect(seen.has(`1:${b}`), b).toBe(true);
  });

  it('paint the chart: raise, call and fold only (open or fold for an opening chart)', () => {
    const rand = seeded(4);
    for (let i = 0; i < 30; i++) {
      const q = buildQuestion(3, rand);
      const cells = (q.answer as { cells: string[] }).cells;
      expect(cells.every((c) => c === 'raise' || c === 'call' || c === 'fold')).toBe(true);
      const ids = q.choices!.map((c) => c.id);
      if (q.choices!.some((c) => c.label === 'Open')) expect(ids).toEqual(['raise', 'fold']);
      else expect(q.choices!.map((c) => c.label)).toContain('Raise');
      expect(ids.every((id) => ['raise', 'call', 'fold'].includes(id))).toBe(true);
    }
    const btn = paintCells(chart('vs RFI MP', 'BTN'));
    expect(btn[cellByName('AA')!]).toBe('raise');
    expect(btn[cellByName('99')!]).toBe('call');
    expect(paintCells(charts('RFI')[0]!).includes('call')).toBe(false);
  });

  it('a painted chart is graded by combos', () => {
    const q = buildQuestion(3, seeded(4));
    const cells = (q.answer as { cells: string[] }).cells;
    expect(grade(q, { kind: 'grid', cells }).error).toBe(0);
    const allFold = cells.map(() => 'fold');
    expect(grade(q, { kind: 'grid', cells: allFold }).correct).toBe(false);
  });

  it('maths: pot-sized bet, defend half', () => {
    const rand = seeded(9);
    for (let i = 0; i < 40; i++) {
      const q = mathsQuestion({ currency: home.currency, blinds: home.blinds }, 4, rand);
      if (q.type === 'mdf' && (q.data as { fraction: number }).fraction === 1) expect((q.answer as { value: number }).value).toBe(50);
    }
  });
});

describe('the routine', () => {
  it('the day\'s set: ten questions, the same on every device, missed ones come back', () => {
    const st = defaultState();
    const a = dailySet('2026-10-10', st);
    const b = dailySet('2026-10-10', st);
    expect(a).toHaveLength(10);
    expect(a.map((q) => q.prompt)).toEqual(b.map((q) => q.prompt));
    const missed = a.find((q) => q.quiz === 'maths')!;
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

  /** A day with a set of two; `done` answers both (the first one right). */
  const day = (date: string, done: boolean, practice = 0): DayRecord => {
    const set = dailySet(date, defaultState()).slice(0, 2);
    const answer = (q: Question, correct: boolean, daily: boolean): Attempt => ({ at: `${date}T10:00:00Z`, qid: q.id, quiz: q.quiz, type: q.type, level: 1, correct, ms: 1, given: { kind: 'number', value: 0 }, ...(daily ? { daily: true } : {}) });
    const practised = Array.from({ length: practice }, (_, i) => answer({ ...set[0]!, id: `p${i}` }, i % 2 === 0, false));
    return { id: `day:${date}`, date, set, attempts: [...(done ? set.map((q, i) => answer(q, i === 0, true)) : []), ...practised] };
  };

  it('the streak counts finished days in a row', () => {
    const lines = (days: DayRecord[]) => allLines([], days);
    const days = [day('2026-10-07', true), day('2026-10-08', true), day('2026-10-09', true), day('2026-10-10', false)];
    expect(streak(lines(days), '2026-10-10')).toBe(3);
    expect(streak(lines([...days.slice(0, 3), day('2026-10-10', true)]), '2026-10-10')).toBe(4);
    expect(streak(lines([day('2026-10-07', true)]), '2026-10-10')).toBe(0);
    expect(QUIZZES).toHaveLength(7);
  });

  it('missed questions of Guess the stack never come back', () => {
    const rand = seeded(2);
    const stackQ = stackQuestion(home, 2, rand);
    const mathsQ = mathsQuestion({ currency: home.currency, blinds: home.blinds }, 1, rand);
    expect(updateReview([], stackQ, false)).toEqual([]);
    expect(updateReview([], mathsQ, false)).toEqual([mathsQ]);
    // older states kept them: they go on loading
    expect(fullState({ id: 'state', review: [stackQ, mathsQ] }).review).toEqual([mathsQ]);
  });

  it('the last answers: 50 per quiz, without their questions', () => {
    const at = (quiz: 'maths' | 'stack', i: number): Attempt => ({ at: String(i), qid: `q${i}`, quiz, type: 't', level: 1, correct: true, ms: 1, given: { kind: 'number', value: 1 }, daily: true });
    let recent: Answered[] = [];
    for (let i = 0; i < 120; i++) recent = addRecent(recent, at(i % 12 === 0 ? 'stack' : 'maths', i));
    expect(recent.filter((a) => a.quiz === 'maths')).toHaveLength(RECENT_PER_QUIZ);
    expect(recent.filter((a) => a.quiz === 'stack')).toHaveLength(10);
    expect(recent.at(-1)).toEqual({ at: '119', quiz: 'maths', level: 1, correct: true });
    expect(Object.keys(recent[0]!)).not.toContain('given');
  });

  /** Data as it was before the history: a state without the last answers, a day item per day. */
  const oldData = (): QuizItem[] => {
    const rand = seeded(3);
    const review = [stackQuestion(home, 1, rand), mathsQuestion({ currency: home.currency, blinds: home.blinds }, 1, rand)];
    const { recent: _recent, ...state } = { ...defaultState(), review };
    void _recent;
    return [state as QuizState, day('2026-10-07', true, 3), day('2026-10-08', true), day('2026-10-09', false, 4), day('2026-10-10', false, 1)];
  };

  it('days before today fold into one history line each; today keeps its questions', () => {
    const items = oldData();
    const before = allLines([], items.filter((x): x is DayRecord => x.id.startsWith('day:')));
    const tidy = tidyQuiz(items, '2026-10-10', false);
    expect(tidy.map((x) => x.id).sort()).toEqual(['day:2026-10-10', 'history', 'state']);
    expect(tidy.every((x) => isQuizItemId(x.id))).toBe(true);
    const history = tidy.find((x): x is QuizHistory => x.id === 'history')!;
    expect(history.days.map((l) => l.date)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
    expect(history.days[0]).toMatchObject({ set: 2, done: true });
    expect(history.days[2]).toMatchObject({ set: 2, done: false });
    // right / answered per quiz, practice included
    const answered = (l: DayLine) => Object.values(l.quizzes).reduce((t, x) => t + x![1], 0);
    expect(history.days.map(answered)).toEqual([5, 2, 4]);
    expect(Object.values(history.days[1]!.quizzes).reduce((t, x) => t + x![0], 0)).toBe(1);
    // the state: the last answers gathered from every day, the stack question out of the review
    const state = tidy.find((x): x is QuizState => x.id === 'state')!;
    expect(state.recent).toHaveLength(5 + 2 + 4 + 1);
    expect(state.review.map((q) => q.quiz)).toEqual(['maths']);
    // streak and stats read the same from the history as from the days
    const today = tidy.filter((x): x is DayRecord => x.id.startsWith('day:'));
    expect(allLines(history.days, today)).toEqual(before);
    expect(streak(allLines(history.days, today), '2026-10-10')).toBe(0);
    expect(streak(allLines(history.days, today), '2026-10-09')).toBe(2);
    const stats = statsOf(state.recent, allLines(history.days, today));
    expect(QUIZZES.reduce((t, q) => t + stats[q].total, 0)).toBe(12);
    // idempotent: a second tidy changes nothing
    expect(tidyQuiz(tidy, '2026-10-10', false)).toEqual(tidy);
  });

  it('the admin and local-only mode keep every day, with the same history', () => {
    const items = oldData();
    const tidy = tidyQuiz(items, '2026-10-10', true);
    expect(tidy.filter((x) => x.id.startsWith('day:'))).toHaveLength(4);
    const lean = tidyQuiz(items, '2026-10-10', false);
    expect(tidy.find((x) => x.id === 'history')).toEqual(lean.find((x) => x.id === 'history'));
    expect(tidy.find((x) => x.id === 'state')).toEqual(lean.find((x) => x.id === 'state'));
    expect(tidyQuiz(tidy, '2026-10-10', true)).toEqual(tidy);
    // the day after, the admin's history grows by today; a user who stops being admin folds the same
    expect(tidyQuiz(tidy, '2026-10-11', false)).toEqual(tidyQuiz(lean, '2026-10-11', false));
    // nothing stored yet: nothing made
    expect(tidyQuiz([], '2026-10-10', false)).toEqual([]);
  });
});
