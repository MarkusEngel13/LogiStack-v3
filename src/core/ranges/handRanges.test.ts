import { expect, test } from 'vitest';
import { replay } from '../engine/replay';
import { FIXTURES } from '../fixtures';
import { noteAt, notesBefore, playerRange, withNote, withoutNote } from './handRanges';
import { LIBRARY } from './library';
import { comboTotal } from './range';

const charts = LIBRARY.map((r) => ({ ...r }));

test('the latest range at or before the step applies', () => {
  const notes = withNote(withNote([], { seat: 2, fromEvent: 3, range: 'AA' }), { seat: 2, fromEvent: 8, range: 'KK' });
  expect(noteAt(notes, 2, 2)).toBeNull();
  expect(noteAt(notes, 2, 5)?.range).toBe('AA');
  expect(noteAt(notes, 2, 8)?.range).toBe('KK');
  expect(noteAt(notes, 4, 8)).toBeNull();
});

test('setting a range at the same step replaces it; removing brings back the earlier one', () => {
  let notes = withNote([], { seat: 2, fromEvent: 3, range: 'AA' });
  notes = withNote(notes, { seat: 2, fromEvent: 6, range: 'QQ' });
  notes = withNote(notes, { seat: 2, fromEvent: 6, range: 'JJ' });
  expect(notes).toHaveLength(2);
  expect(noteAt(withoutNote(notes, 2, 6), 2, 9)?.range).toBe('AA');
});

test('a branch drops the ranges set after it', () => {
  const notes = [
    { seat: 2, fromEvent: 3, range: 'AA' },
    { seat: 2, fromEvent: 9, range: 'KK' },
  ];
  expect(notesBefore(notes, 5)).toEqual([{ seat: 2, fromEvent: 3, range: 'AA' }]);
});

test('your range wins over the chart; without one the chart for the spot applies', () => {
  const hand = { ...FIXTURES.multiwayShowdown, ranges: [{ seat: 2, fromEvent: 6, range: 'QQ+, AKs' }] };
  const s = replay(hand, 8);
  const carl = playerRange(hand, s, 8, 2, charts);
  expect(carl.note).not.toBeNull();
  expect(comboTotal(carl.weights)).toBe(18 + 4);
  const dora = playerRange(hand, s, 8, 4, charts);
  expect(dora.note).toBeNull();
  expect(dora.explanation).toMatch(/^Called an open from the LJ/);
});
