import { describe, expect, test } from 'vitest';
import { validateDraft } from './draft';
import { WATCH_TYPES, watchDraft } from './watchTable';

describe('the watch table', () => {
  test('six bots of the watch types, no Hero, and a setup the engine accepts', () => {
    let seed = 0.11;
    const rand = () => (seed = (seed * 9301 + 0.49297) % 1);
    const d = watchDraft(rand);
    expect(d.heroSeat).toBeNull();
    expect(d.venue).toBe('casino');
    expect(d.seats).toHaveLength(6);
    for (const p of d.seats) expect(WATCH_TYPES).toContain(p!.playerType);
    expect(new Set(d.seats.map((p) => p!.name)).size).toBe(6);
    expect(validateDraft(d).errors).toEqual([]);
  });

  test('two players of one type are told apart by a number', () => {
    const d = watchDraft(() => 0.4); // every seat the same type
    expect(d.seats.map((p) => p!.name)).toEqual(['Nit 1', 'Nit 2', 'Nit 3', 'Nit 4', 'Nit 5', 'Nit 6']);
  });

  test('a weak-tight rec plays through his sliders (he has no motive preset of his own)', () => {
    const d = watchDraft(() => 0.5);
    expect(d.seats.every((p) => p!.playerType === 'Weak-tight rec' && p!.style?.settings.base === 'Weak-tight rec')).toBe(true);
    expect(validateDraft(d).errors).toEqual([]);
  });
});
