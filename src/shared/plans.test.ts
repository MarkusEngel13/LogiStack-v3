import { expect, test } from 'vitest';
import { canSave, canShare, limitsFor } from './plans';

test('free keeps 20 hands, premium unlimited, admins everything', () => {
  expect(canSave('free', 'user', 'hand', 19, true).ok).toBe(true);
  expect(canSave('free', 'user', 'hand', 20, true).ok).toBe(false);
  expect(canSave('free', 'user', 'hand', 20, false).ok).toBe(true); // editing an existing one
  expect(canSave('premium', 'user', 'hand', 5000, true).ok).toBe(true);
  expect(canSave('free', 'admin', 'player', 99, true).ok).toBe(true);
});

test('sharing profiles is Pro', () => {
  expect(canShare('premium', 'user').ok).toBe(false);
  expect(canShare('pro', 'user').ok).toBe(true);
  expect(canShare('free', 'editor').ok).toBe(true);
  expect(limitsFor('free').explorer).toBe(false);
});
