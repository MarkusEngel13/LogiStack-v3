import { describe, expect, test } from 'vitest';
import { addLeaveGuard, hasUnsavedWork, leaveScreen, type AskBeforeLeaving } from './unsavedGuard';

describe('leaving a screen', () => {
  test('nothing unsaved: go at once', () => {
    let went = 0;
    leaveScreen(() => went++);
    expect(went).toBe(1);
    expect(hasUnsavedWork()).toBe(false);
  });

  test('unsaved: the screen asks, and only its answer lets you go', () => {
    let pending: (() => void) | null = null;
    const remove = addLeaveGuard((go) => (pending = go));
    let went = 0;
    leaveScreen(() => went++);
    expect(hasUnsavedWork()).toBe(true);
    expect(went).toBe(0); // the question is open (Cancel = never calling it)
    pending!(); // Save or Discard
    expect(went).toBe(1);
    remove();
    expect(hasUnsavedWork()).toBe(false);
  });

  test('the latest screen is asked; taking a guard back leaves the others', () => {
    const asked: string[] = [];
    const ask =
      (name: string): AskBeforeLeaving =>
      () =>
        asked.push(name);
    const removeA = addLeaveGuard(ask('a'));
    const removeB = addLeaveGuard(ask('b'));
    leaveScreen(() => {});
    removeB();
    leaveScreen(() => {});
    removeA();
    removeA(); // twice is harmless
    let went = false;
    leaveScreen(() => (went = true));
    expect(asked).toEqual(['b', 'a']);
    expect(went).toBe(true);
  });
});
