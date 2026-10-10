/**
 * Quiz results, kept in this browser and synced to your account (sync.ts, kind "quiz"): one item
 * per day ("day:2026-10-10": the day's set and every answer) and one "state" item (your levels,
 * your chip set, the questions you missed).
 */

import { dailySet, defaultState, setDone, today, type Attempt, type DayRecord, type QuizState } from '../../core/quiz/daily';
import type { Question } from '../../core/quiz/types';

const KEY = 'logistack.quiz.v1';
/** Answers kept per day (practice can run long). */
const MAX_ATTEMPTS = 500;

type Item = QuizState | DayRecord;

function readAll(): Item[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Item[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage full or blocked: this session's answers are kept until the page closes
  }
}

function put(item: Item) {
  writeAll([...readAll().filter((x) => x.id !== item.id), item]);
}

export function loadState(): QuizState {
  const s = readAll().find((x): x is QuizState => x.id === 'state');
  const d = defaultState();
  return s ? { ...d, ...s, levels: { ...d.levels, ...s.levels } } : d;
}

export const saveState = (s: QuizState) => put(s);

export const loadDays = (): DayRecord[] =>
  readAll()
    .filter((x): x is DayRecord => x.id.startsWith('day:'))
    .sort((a, b) => a.date.localeCompare(b.date));

/** Today's record, with its set made (once, then kept: the same set all day on every device). */
export function todayRecord(state: QuizState): DayRecord {
  const date = today();
  const existing = loadDays().find((d) => d.date === date);
  if (existing && existing.set.length) return existing;
  const day: DayRecord = { id: `day:${date}`, date, set: dailySet(date, state), attempts: existing?.attempts ?? [] };
  put(day);
  return day;
}

/** Records an answer on today's record. */
export function addAttempt(a: Attempt) {
  const date = today();
  const day = loadDays().find((d) => d.date === date) ?? { id: `day:${date}`, date, set: [], attempts: [] };
  put({ ...day, attempts: [...day.attempts, a].slice(-MAX_ATTEMPTS) });
}

/** All answers, oldest first. */
export const allAttempts = (): Attempt[] => loadDays().flatMap((d) => d.attempts);

/** The day's questions not answered yet (in the set's order). */
export function openInSet(day: DayRecord): Question[] {
  return day.set.filter((q) => !day.attempts.some((a) => a.qid === q.id && a.daily));
}

/** For the start page: how many of today's set are left (null: none started or made yet). */
export function leftToday(): number | null {
  const day = loadDays().find((d) => d.date === today());
  if (!day || !day.set.length) return null;
  return setDone(day) ? 0 : openInSet(day).length;
}
