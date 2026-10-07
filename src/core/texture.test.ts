import { describe, expect, test } from 'vitest';
import { parseCards } from './cards';
import { lastCardScare, nutsChanged, texture } from './texture';

const b = (t: string) => parseCards(t.split(' '));

describe('board texture', () => {
  test('wet, static, paired, monotone', () => {
    expect(texture(b('Js 9d 2s'))).toMatchObject({ wet: true, static: false, flushDraw: true, straightDraws: true });
    expect(texture(b('Ac 7d 2h'))).toMatchObject({ wet: false, static: true, paired: false });
    expect(texture(b('Kh Kd 4c'))).toMatchObject({ paired: true, static: true });
    expect(texture(b('9h 6h 2h'))).toMatchObject({ monotone: true, flushPossible: true, wet: true });
    expect(texture(b('Ts 9c 8d'))).toMatchObject({ straightPossible: true, wet: true, static: false });
  });

  test('the wheel counts: A-3-5 makes a straight possible', () => {
    expect(texture(b('Ac 3d 5h')).straightPossible).toBe(true);
  });

  test('scare cards: the flush gets there, a straight gets there, the board pairs; a blank changes nothing', () => {
    expect(lastCardScare(b('Js 9d 2s'))).toBeNull();
    expect(lastCardScare(b('Js 9d 2s 5s'))).toEqual({ flush: true, straight: false, pair: false });
    expect(lastCardScare(b('Js 9d 2c Th'))).toMatchObject({ straight: true });
    expect(lastCardScare(b('Js 9d 2c 9h'))).toMatchObject({ pair: true });
    expect(nutsChanged(b('Ac 7d 2h 2c'))).toBe(true);
    expect(nutsChanged(b('Ac 7d 2h Kc'))).toBe(false);
  });
});
