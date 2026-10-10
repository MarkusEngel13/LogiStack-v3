/**
 * The quiz routine: a set of ten a day (mixed from every quiz at your levels, with up to three
 * questions you missed before), your levels (up one when you get 8 of the last 10 right), the
 * streak (days in a row with the set finished), and stats per quiz.
 */

import { drawsQuestionFor } from './draws';
import { mathsQuestion } from './maths';
import { rangesQuestion } from './ranges';
import { CHIP_PRESETS, stackQuestion, type ChipSet } from './stack';
import { QUIZ_INFO, QUIZZES, seeded, type Given, type QuizId, type Question, type Rand } from './types';

export interface Attempt {
  at: string;
  qid: string;
  quiz: QuizId;
  type: string;
  level: number;
  correct: boolean;
  error?: number;
  /** How long you took. */
  ms: number;
  given: Given;
  /** Part of the day's set. */
  daily?: boolean;
}

/** One day: its set of questions and every answer given that day. */
export interface DayRecord {
  id: string; // "day:2026-10-10"
  date: string;
  set: Question[];
  attempts: Attempt[];
}

export interface QuizState {
  id: 'state';
  levels: Record<QuizId, number>;
  chipSet: ChipSet;
  /** Missed questions that come back (oldest first). */
  review: Question[];
}

export const DAILY_SIZE = 10;
const DAILY_MIX: Record<QuizId, number> = { stack: 3, maths: 3, ranges: 2, draws: 2 };
const REVIEW_MAX = 40;

export const defaultState = (): QuizState => ({
  id: 'state',
  levels: { stack: 1, maths: 1, ranges: 1, draws: 1 },
  chipSet: CHIP_PRESETS[0]!,
  review: [],
});

export function makeQuestion(quiz: QuizId, level: number, state: QuizState, rand: Rand): Question {
  const set = state.chipSet;
  if (quiz === 'stack') return stackQuestion(set, level, rand);
  if (quiz === 'maths') return mathsQuestion({ currency: set.currency, blinds: set.blinds }, level, rand);
  if (quiz === 'ranges') return rangesQuestion(level, rand);
  return drawsQuestionFor(level, rand);
}

/** A number from a date, so a day's set is the same on every device. */
const dateSeed = (date: string) => [...date].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;

/** The day's ten: the mix at your levels, with up to three missed questions in their place. */
export function dailySet(date: string, state: QuizState): Question[] {
  const rand = seeded(dateSeed(date));
  const out: Question[] = [];
  const review = [...state.review];
  for (const quiz of QUIZZES) {
    for (let k = 0; k < DAILY_MIX[quiz]; k++) {
      const again = k === 0 && out.filter((q) => state.review.some((r) => r.id === q.id)).length < 3 ? review.findIndex((r) => r.quiz === quiz) : -1;
      if (again >= 0) out.push(review.splice(again, 1)[0]!);
      else out.push(makeQuestion(quiz, state.levels[quiz], state, rand));
    }
  }
  return out;
}

/** The review queue after an answer: a miss goes in (once), a right answer to a review question comes out. */
export function updateReview(review: readonly Question[], q: Question, correct: boolean): Question[] {
  const rest = review.filter((r) => r.id !== q.id);
  return correct ? rest : [...rest, q].slice(-REVIEW_MAX);
}

/** Up a level after 8 of the last 10 at this level right (null: stay). */
export function levelUp(attempts: readonly Attempt[], quiz: QuizId, level: number): number | null {
  if (level >= QUIZ_INFO[quiz].levels) return null;
  const last = attempts.filter((a) => a.quiz === quiz && a.level === level).slice(-10);
  return last.length >= 10 && last.filter((a) => a.correct).length >= 8 ? level + 1 : null;
}

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Has the day's set been answered in full? */
export const setDone = (day: DayRecord) => day.set.length > 0 && day.set.every((q) => day.attempts.some((a) => a.qid === q.id && a.daily));

/** Days in a row with the set finished, up to today (today counts once done; an open today doesn't break it). */
export function streak(days: readonly DayRecord[], todayDate: string): number {
  const done = new Set(days.filter(setDone).map((d) => d.date));
  let n = 0;
  const d = new Date(`${todayDate}T12:00:00`);
  if (!done.has(todayDate)) d.setDate(d.getDate() - 1);
  while (done.has(today(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export interface QuizStats {
  answered: number;
  correct: number;
  /** For number answers: the median miss (share of the answer). */
  medianError?: number;
}

/** Per quiz, over the last 100 answers. */
export function statsOf(attempts: readonly Attempt[]): Record<QuizId, QuizStats> {
  const out = {} as Record<QuizId, QuizStats>;
  for (const quiz of QUIZZES) {
    const xs = attempts.filter((a) => a.quiz === quiz).slice(-100);
    const errs = xs.map((a) => a.error).filter((e): e is number => e !== undefined && Number.isFinite(e)).sort((a, b) => a - b);
    out[quiz] = { answered: xs.length, correct: xs.filter((a) => a.correct).length, ...(errs.length ? { medianError: errs[Math.floor(errs.length / 2)] } : {}) };
  }
  return out;
}
