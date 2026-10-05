import { expect, test } from 'vitest';
import { positionLabels } from './positions';

/** Names in seat order, starting with the small blind (heads-up: the button). */
const names = (players: number, buttonDealtIn = true) => {
  const labels = positionLabels(Array.from({ length: players }, (_, i) => i), buttonDealtIn);
  return Array.from({ length: players }, (_, i) => labels.get(i));
};

test.each([
  [2, ['BTN', 'BB']],
  [3, ['SB', 'BB', 'BTN']],
  [4, ['SB', 'BB', 'CO', 'BTN']],
  [5, ['SB', 'BB', 'HJ', 'CO', 'BTN']],
  [6, ['SB', 'BB', 'LJ', 'HJ', 'CO', 'BTN']],
  [7, ['SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO', 'BTN']],
  [8, ['SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN']],
  [9, ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN']],
  [10, ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN']],
])('%i players: CO, HJ, LJ back from the button, UTG onwards from the first to act', (players, expected) => {
  expect(names(players)).toEqual(expected);
});

test('dead button: the seat before it is still the CO', () => {
  expect(names(5, false)).toEqual(['SB', 'BB', 'LJ', 'HJ', 'CO']);
});
