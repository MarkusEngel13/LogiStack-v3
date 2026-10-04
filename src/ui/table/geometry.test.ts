import { describe, expect, test } from 'vitest';
import { seatSlots, slotOfSeat } from './geometry';

describe('seat geometry', () => {
  test.each([2, 3, 4, 5, 6, 7, 8, 9, 10])('%i seats: Hero bottom centre, mirror-symmetric, bets inside the felt', (n) => {
    const slots = seatSlots(n);
    expect(slots).toHaveLength(n);
    expect(slots[0]!.plate.x).toBeCloseTo(50);
    expect(slots[0]!.side).toBe('bottom');
    for (let i = 1; i < n; i++) {
      const a = slots[i]!.plate;
      const b = slots[n - i]!.plate; // mirror image across the vertical axis
      expect(a.x).toBeCloseTo(100 - b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
    for (const s of slots) {
      expect(s.bet.x).toBeGreaterThan(5);
      expect(s.bet.x).toBeLessThan(95);
      expect(s.bet.y).toBeGreaterThan(10);
      expect(s.bet.y).toBeLessThan(90);
    }
  });

  test('even tables have a seat at top centre', () => {
    for (const n of [2, 4, 6, 8, 10]) {
      const top = seatSlots(n)[n / 2]!;
      expect(top.plate.x).toBeCloseTo(50);
      expect(top.side).toBe('top');
    }
  });

  test('clockwise: the seat after Hero is on screen-left', () => {
    for (let n = 3; n <= 10; n++) expect(seatSlots(n)[1]!.plate.x).toBeLessThan(50);
  });

  test('rotation puts the anchor seat at slot 0', () => {
    expect(slotOfSeat(4, 4, 9)).toBe(0);
    expect(slotOfSeat(5, 4, 9)).toBe(1);
    expect(slotOfSeat(3, 4, 9)).toBe(8);
    expect(slotOfSeat(0, 4, 9)).toBe(5);
  });
});
