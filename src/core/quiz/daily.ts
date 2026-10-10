/**
 * The quiz routine: a set of ten a day (mixed from every quiz at your levels, with up to three
 * questions you missed before), your levels (up one when you get 8 of the last 10 right), the
 * streak (days in a row with the set finished), and stats per quiz.
 *
 * What is kept (ui/quiz/quizStore, synced as kind "quiz"), lean so the Free plan's ten items do:
 * - `state`: levels, chip set, the missed questions that come back (max 40; never Guess the stack:
 *   those are bulky and quick to make again), and the last answers without their questions (50
 *   per quiz: enough for the level-ups and the stats);
 * - `history`: a line a day (the set's size, finished or not, right and answered per quiz);
 * - `day:2026-10-10`: today's set and every answer. Days before today fold into the history
 *   (tidyQuiz); the admin and local-only mode keep their day items too.
 */

import { boardQuestion } from './board';
import { buildQuestion } from './build';
import { drawsQuestionFor } from './draws';
import { mathsQuestion } from './maths';
import { rangesQuestion } from './ranges';
import { readsQuestion } from './reads';
import { CHIP_PRESETS, stackQuestion, type ChipSet } from './stack';
import { QUIZ_INFO, QUIZZES, seeded, type Given, type QuizId, type Question, type Rand } from './types';

/** An answer without its question: enough for the level-ups and the stats. */
export interface Answered {
  at: string;
  quiz: QuizId;
  level: number;
  correct: boolean;
  error?: number;
}

export interface Attempt extends Answered {
  qid: string;
  type: string;
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
  /** The last answers, oldest first (RECENT_PER_QUIZ per quiz). */
  recent: Answered[];
}

/** A day in one line. */
export interface DayLine {
  date: string;
  /** Questions in the day's set. */
  set: number;
  /** The set answered in full. */
  done: boolean;
  /** Per quiz: [right, answered] that day, practice included. */
  quizzes: Partial<Record<QuizId, [number, number]>>;
}

export interface QuizHistory {
  id: 'history';
  days: DayLine[];
}

export type QuizItem = QuizState | QuizHistory | DayRecord;

export const DAILY_SIZE = 10;
const DAILY_MIX: Record<QuizId, number> = { stack: 2, maths: 2, ranges: 1, draws: 1, build: 1, board: 2, reads: 1 };
const REVIEW_MAX = 40;
export const RECENT_PER_QUIZ = 50;

export const defaultState = (): QuizState => ({
  id: 'state',
  levels: { stack: 1, maths: 1, ranges: 1, draws: 1, build: 1, board: 1, reads: 1 },
  chipSet: CHIP_PRESETS[0]!,
  review: [],
  recent: [],
});

/** Missed questions of Guess the stack never come back (bulky, and a new stack is as good). */
const keptForReview = (q: Question) => q.quiz !== 'stack';

/** A stored state with the defaults filled in (older items lack some fields). */
export function fullState(s: Partial<QuizState> | undefined): QuizState {
  const d = defaultState();
  if (!s) return d;
  return { ...d, ...s, levels: { ...d.levels, ...s.levels }, review: (s.review ?? []).filter(keptForReview), recent: s.recent ?? [] };
}

export function makeQuestion(quiz: QuizId, level: number, state: QuizState, rand: Rand): Question {
  const set = state.chipSet;
  if (quiz === 'stack') return stackQuestion(set, level, rand);
  if (quiz === 'maths') return mathsQuestion({ currency: set.currency, blinds: set.blinds }, level, rand);
  if (quiz === 'ranges') return rangesQuestion(level, rand);
  if (quiz === 'build') return buildQuestion(level, rand);
  if (quiz === 'board') return boardQuestion(level, rand);
  if (quiz === 'reads') return readsQuestion(set, level, rand);
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
      // painting a whole chart is practice, not one of the day's quick ten
      else out.push(makeQuestion(quiz, quiz === 'build' && state.levels[quiz] >= 3 ? 1 + Math.floor(rand() * 2) : state.levels[quiz], state, rand));
    }
  }
  return out;
}

/** The review queue after an answer: a miss goes in (once; never Guess the stack), a right answer to a review question comes out. */
export function updateReview(review: readonly Question[], q: Question, correct: boolean): Question[] {
  const rest = review.filter((r) => r.id !== q.id);
  return correct || !keptForReview(q) ? rest : [...rest, q].slice(-REVIEW_MAX);
}

/** An answer as `recent` keeps it. */
export const answeredOf = (a: Answered): Answered => ({ at: a.at, quiz: a.quiz, level: a.level, correct: a.correct, ...(a.error !== undefined ? { error: a.error } : {}) });

/** The last RECENT_PER_QUIZ answers of each quiz, oldest first. */
export function trimRecent(xs: readonly Answered[]): Answered[] {
  const count: Partial<Record<QuizId, number>> = {};
  const out: Answered[] = [];
  for (let i = xs.length - 1; i >= 0; i--) {
    const x = xs[i]!;
    count[x.quiz] = (count[x.quiz] ?? 0) + 1;
    if (count[x.quiz]! <= RECENT_PER_QUIZ) out.push(x);
  }
  return out.reverse();
}

export const addRecent = (recent: readonly Answered[], a: Answered): Answered[] => trimRecent([...recent, answeredOf(a)]);

/** Up a level after 8 of the last 10 at this level right (null: stay). */
export function levelUp(answers: readonly Answered[], quiz: QuizId, level: number): number | null {
  if (level >= QUIZ_INFO[quiz].levels) return null;
  const last = answers.filter((a) => a.quiz === quiz && a.level === level).slice(-10);
  return last.length >= 10 && last.filter((a) => a.correct).length >= 8 ? level + 1 : null;
}

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Has the day's set been answered in full? */
export const setDone = (day: DayRecord) => day.set.length > 0 && day.set.every((q) => day.attempts.some((a) => a.qid === q.id && a.daily));

/** A day's record in one line. */
export function dayLine(day: DayRecord): DayLine {
  const quizzes: Partial<Record<QuizId, [number, number]>> = {};
  for (const a of day.attempts) {
    const [right, answered] = quizzes[a.quiz] ?? [0, 0];
    quizzes[a.quiz] = [right + (a.correct ? 1 : 0), answered + 1];
  }
  return { date: day.date, set: day.set.length, done: setDone(day), quizzes };
}

/** Every day's line, oldest first: the history's, and the day records still kept over them (they hold every answer). */
export function allLines(history: readonly DayLine[], days: readonly DayRecord[]): DayLine[] {
  const byDate = new Map(history.map((l) => [l.date, l]));
  for (const d of days) byDate.set(d.date, dayLine(d));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const isState = (x: QuizItem): x is QuizState => x.id === 'state';
const isHistory = (x: QuizItem): x is QuizHistory => x.id === 'history';
const isDay = (x: QuizItem): x is DayRecord => x.id.startsWith('day:');

/**
 * The stored quiz items tidied (idempotent, and it moves older data to this shape): days before
 * today get their line in the history, the review drops Guess the stack, the last answers are
 * gathered from the days when the state has none yet. `keepDays` (the admin, local-only mode)
 * keeps the day items; otherwise days before today are removed (sync deletes them on the server).
 */
export function tidyQuiz(items: readonly QuizItem[], todayDate: string, keepDays: boolean): QuizItem[] {
  const days = items.filter(isDay).sort((a, b) => a.date.localeCompare(b.date));
  const past = days.filter((d) => d.date < todayDate);
  const stored = items.find(isHistory);
  const lines = allLines(stored?.days ?? [], past);
  const history: QuizHistory | null = lines.length ? { id: 'history', days: lines } : null;
  const out: QuizItem[] = [];
  for (const x of items) {
    if (isState(x)) out.push({ ...fullState(x), recent: x.recent ?? trimRecent(days.flatMap((d) => d.attempts).map(answeredOf)) });
    else if (isHistory(x)) {
      if (history) out.push(history);
    } else if (isDay(x)) {
      if (keepDays || x.date >= todayDate) out.push(x);
    } else out.push(x);
  }
  if (history && !stored) out.push(history);
  return out;
}

/** Days in a row with the set finished, up to today (today counts once done; an open today doesn't break it). */
export function streak(lines: readonly DayLine[], todayDate: string): number {
  const done = new Set(lines.filter((l) => l.done).map((l) => l.date));
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
  /** Of the last answers (`recent`). */
  answered: number;
  correct: number;
  /** For number answers: the median miss (share of the answer). */
  medianError?: number;
  /** Answered in all (every day's line). */
  total: number;
}

/** Per quiz: right and the usual miss over the last answers, and how many in all. */
export function statsOf(recent: readonly Answered[], lines: readonly DayLine[]): Record<QuizId, QuizStats> {
  const out = {} as Record<QuizId, QuizStats>;
  for (const quiz of QUIZZES) {
    const xs = recent.filter((a) => a.quiz === quiz);
    const errs = xs.map((a) => a.error).filter((e): e is number => e !== undefined && Number.isFinite(e)).sort((a, b) => a - b);
    const total = lines.reduce((t, l) => t + (l.quizzes[quiz]?.[1] ?? 0), 0);
    out[quiz] = { answered: xs.length, correct: xs.filter((a) => a.correct).length, ...(errs.length ? { medianError: errs[Math.floor(errs.length / 2)] } : {}), total: Math.max(total, xs.length) };
  }
  return out;
}
