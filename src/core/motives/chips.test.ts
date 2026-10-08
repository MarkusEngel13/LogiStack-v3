import { describe, expect, test } from 'vitest';
import { chipsMade, niceStep } from './chips';
import { MOTIVE_PRESETS, withState } from './profile';

/** A repeatable stream of draws. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const limits = { minTo: 100, maxTo: 100_000 };

describe('how the chips go in', () => {
  test('amounts round to chips: a sixth of the amount or less, in 1-2-5 steps', () => {
    expect(niceStep(68)).toBe(10);
    expect(niceStep(275)).toBe(20);
    expect(niceStep(1360)).toBe(200);
    expect(chipsMade(343, 0, limits, () => 0.5)).toBe(350);
  });

  test('the legal minimum holds, and an amount at the stack is an all-in', () => {
    expect(chipsMade(90, 0, limits, () => 0.5)).toBe(100);
    expect(chipsMade(120_000, 0, limits, () => 0.5)).toBeNull();
  });

  // Marius: regs count the pot well; fish mistake it - their amounts stray much more.
  test('fish stray from the size they mean far more than regs; drinking makes it worse', () => {
    const strays = (error: number) => {
      const rand = seeded(7);
      let off = 0;
      for (let i = 0; i < 400; i++) off += Math.abs(Math.log(chipsMade(1000, error, limits, rand)! / 1000));
      return off / 400;
    };
    const reg = strays(MOTIVE_PRESETS.Reg!.sizeError);
    const fish = strays(MOTIVE_PRESETS.Fish!.sizeError);
    expect(reg).toBeLessThan(0.06);
    expect(fish).toBeGreaterThan(2 * reg);
    expect(strays(withState(MOTIVE_PRESETS.Fish!, { tags: ['drinking'] }).sizeError)).toBeGreaterThan(fish);
  });
});
