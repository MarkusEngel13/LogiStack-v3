/**
 * Quiz results, kept in this browser and synced to your account (sync.ts, kind "quiz"): the
 * "state" item (levels, chip set, missed questions, the last answers), the "history" item (a line
 * a day) and today's "day:2026-10-10" (the day's set and every answer). What each holds and how
 * older days fold into the history: core/quiz/daily.ts.
 */

import { allLines, dailySet, fullState, setDone, tidyQuiz, today, type Attempt, type DayLine, type DayRecord, type QuizHistory, type QuizItem, type QuizState } from '../../core/quiz/daily';
import type { Question } from '../../core/quiz/types';
import { isQuizItemId } from '../../shared/plans';

const KEY = 'logistack.quiz.v1';
/** Answers kept per day (practice can run long). */
const MAX_ATTEMPTS = 500;

function readAll(): QuizItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QuizItem[]).filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeAll(items: QuizItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage full or blocked: this session's answers are kept until the page closes
  }
}

function put(item: QuizItem) {
  writeAll([...readAll().filter((x) => x.id !== item.id), item]);
}

/** An id decoded until it stops changing ("day%3A2026-10-10" -> "day:2026-10-10"); null when it can't be. */
function decoded(id: string): string | null {
  let out = id;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      return null;
    }
  }
  return out;
}

/**
 * Only the ids the server takes (isQuizItemId). The server used to store ids still URL-encoded,
 * so synced browsers got a second copy of each day back ("day%3A2026-10-10"): such a copy takes
 * the real id, or goes when the real one is there. Anything else goes too (sync would push it
 * again and again).
 */
export function cleanIds(items: readonly QuizItem[]): QuizItem[] {
  const ids = new Set(items.map((x) => x.id));
  const out: QuizItem[] = [];
  for (const x of items) {
    if (isQuizItemId(x.id)) {
      out.push(x);
      continue;
    }
    const id = decoded(x.id);
    if (id !== null && isQuizItemId(id) && !ids.has(id)) {
      out.push({ ...x, id } as QuizItem);
      ids.add(id);
    }
  }
  return out;
}

/**
 * Cleans the ids, folds the days before today into the history (and moves older data to the lean
 * shape); the admin and local-only mode (`keepDays`) keep their day items. Writes only when
 * something changed.
 */
export function tidyStore(keepDays: boolean) {
  const items = readAll();
  const tidy = tidyQuiz(cleanIds(items), today(), keepDays);
  if (JSON.stringify(tidy) !== JSON.stringify(items)) writeAll(tidy);
}

export const loadState = (): QuizState => fullState(readAll().find((x): x is QuizState => x.id === 'state'));

export const saveState = (s: QuizState) => put(s);

export const loadDays = (): DayRecord[] =>
  readAll()
    .filter((x): x is DayRecord => x.id.startsWith('day:'))
    .sort((a, b) => a.date.localeCompare(b.date));

/** Every day in one line (the history, and the day items still kept), oldest first. */
export const loadLines = (): DayLine[] => allLines(readAll().find((x): x is QuizHistory => x.id === 'history')?.days ?? [], loadDays());

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
