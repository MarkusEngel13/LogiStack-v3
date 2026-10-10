import { beforeEach, describe, expect, test, vi } from 'vitest';
import { defaultState, today, type DayRecord, type QuizItem } from '../../core/quiz/daily';
import { isQuizItemId } from '../../shared/plans';
import { cleanIds, loadLines, loadState, tidyStore } from './quizStore';

class Mem {
  m = new Map<string, string>();
  writes = 0;
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.writes++;
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const KEY = 'logistack.quiz.v1';
const day = (date: string, id = `day:${date}`): DayRecord => ({ id, date, set: [], attempts: [] });
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return today(d);
};
const stored = () => JSON.parse(localStorage.getItem(KEY)!) as QuizItem[];

beforeEach(() => {
  vi.stubGlobal('localStorage', new Mem());
});

describe('quiz ids the server takes', () => {
  test('a URL-encoded copy takes the real id, or goes when the real one is there; other odd ids go', () => {
    const items: QuizItem[] = [defaultState(), day('2026-10-09'), day('2026-10-09', 'day%3A2026-10-09'), day('2026-10-08', 'day%3A2026-10-08'), day('2026-10-07', 'day%253A2026-10-07'), day('x', 'junk'), day('y', '%E0%A4%A')];
    const clean = cleanIds(items);
    expect(clean.map((x) => x.id)).toEqual(['state', 'day:2026-10-09', 'day:2026-10-08', 'day:2026-10-07']);
    expect(clean.every((x) => isQuizItemId(x.id))).toBe(true);
    expect(cleanIds(clean)).toEqual(clean);
  });

  test('loading the quizzes cleans the ids and folds the days before today, once', () => {
    localStorage.setItem(KEY, JSON.stringify([defaultState(), day(daysAgo(2)), day(daysAgo(1), `day%3A${daysAgo(1)}`), day(today())]));
    tidyStore(false);
    expect(stored().map((x) => x.id).sort()).toEqual([`day:${today()}`, 'history', 'state']);
    expect(loadLines().map((l) => l.date)).toEqual([daysAgo(2), daysAgo(1), today()]);
    expect(loadState().recent).toEqual([]);
    const writes = (localStorage as unknown as Mem).writes;
    tidyStore(false);
    expect((localStorage as unknown as Mem).writes).toBe(writes);
  });

  test('the admin and local-only mode keep the days', () => {
    localStorage.setItem(KEY, JSON.stringify([day(daysAgo(1), `day%3A${daysAgo(1)}`), day(today())]));
    tidyStore(true);
    expect(stored().map((x) => x.id)).toEqual([`day:${daysAgo(1)}`, `day:${today()}`, 'history']);
  });
});
