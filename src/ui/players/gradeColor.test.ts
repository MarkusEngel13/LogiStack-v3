import { expect, test } from 'vitest';
import { gradeColor, gradeLabel, gradeText } from './gradeColor';

test('grades in colour: green, cyan, yellow, orange, red; half steps in between', () => {
  expect([1, 2, 3, 4, 5].map(gradeColor)).toEqual(['#22e06b', '#22d3ee', '#facc15', '#fb8c1e', '#ff3b3b']);
  expect(gradeColor(4.5)).toBe('#fd642d');
  expect(gradeColor(0)).toBe(gradeColor(1));
  expect(gradeColor(9)).toBe(gradeColor(5));
  expect(gradeText(3)).toBe('light-dark(#967a0d, #facc15)');
  expect([3, 3.5].map(gradeLabel)).toEqual(['3', '3.5']);
});
