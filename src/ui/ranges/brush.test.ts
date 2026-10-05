import { describe, expect, test } from 'vitest';
import { CELL_NAMES, cellByName } from '../../core/ranges/hands';
import { setBrushAction, smartPaintCells } from './brush';

const names = (cells: number[]) => cells.map((c) => CELL_NAMES[c]);

describe('brush sliders', () => {
  test('fold gives way first', () => {
    expect(setBrushAction({ allin: 0, raise: 50, call: 0 }, 'call', 30)).toEqual({ allin: 0, raise: 50, call: 30 });
  });

  test('past 100 % the others shrink in proportion', () => {
    expect(setBrushAction({ allin: 0, raise: 50, call: 30 }, 'call', 70)).toEqual({ allin: 0, raise: 30, call: 70 });
    expect(setBrushAction({ allin: 20, raise: 60, call: 20 }, 'call', 60)).toEqual({ allin: 10, raise: 30, call: 60 });
    expect(setBrushAction({ allin: 0, raise: 100, call: 0 }, 'allin', 100)).toEqual({ allin: 100, raise: 0, call: 0 });
  });

  test('values stay whole percentages between 0 and 100', () => {
    expect(setBrushAction({ allin: 0, raise: 0, call: 0 }, 'raise', 140)).toEqual({ allin: 0, raise: 100, call: 0 });
    expect(setBrushAction({ allin: 0, raise: 0, call: 0 }, 'raise', -5)).toEqual({ allin: 0, raise: 0, call: 0 });
  });
});

describe('smart paint', () => {
  test.each([
    ['55', ['55', '66', '77', '88', '99', 'TT', 'JJ', 'QQ', 'KK', 'AA']],
    ['98s', ['98s', 'T9s', 'JTs', 'QJs', 'KQs', 'AKs']],
    ['K9s', ['K9s', 'KTs', 'KJs', 'KQs']],
    ['A9o', ['A9o', 'ATo', 'AJo', 'AQo', 'AKo']],
    ['AA', ['AA']],
  ])('%s paints %j', (start, expected) => {
    expect(names(smartPaintCells(cellByName(start)!))).toEqual(expected);
  });
});
