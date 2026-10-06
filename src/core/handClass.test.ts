import { describe, expect, test } from 'vitest';
import { parseCards } from './cards';
import { classifyAll, classifyHand, MADE_CLASSES, rangeClasses, type HandClass } from './handClass';

const cards = (text: string) => parseCards(text.split(' '));
const cls = (hole: string, board: string): HandClass => {
  const [a, b] = cards(hole);
  return classifyHand([a!, b!], cards(board));
};

describe('made hands', () => {
  test.each([
    // hole, board, class, extra fields
    ['Jh Js', 'Jc 9d 5c', 'set', { position: 'top', pocket: true }],
    ['5h 5s', 'Jc 9d 5c', 'set', { position: 'bottom' }],
    ['9h 9s', 'Jc 9d 5c', 'set', { position: 'middle' }],
    ['Jh 9h', 'Jc 9d 5c', 'two-pair', { position: 'top' }],
    ['Jh 5h', 'Jc 9d 5c', 'two-pair', { position: 'middle' }],
    ['9h 5h', 'Jc 9d 5c', 'two-pair', { position: 'bottom' }],
    ['Ah As', 'Jc 9d 5c', 'overpair', { pocket: true }],
    ['Ah Jd', 'Jc 9d 5c', 'top-pair', { kicker: 'top' }],
    ['Kh Jd', 'Jc 9d 5c', 'top-pair', { kicker: 'good' }],
    ['Jd 2h', 'Jc 9d 5c', 'top-pair', { kicker: 'weak' }],
    ['Th Ts', 'Jc 9d 5c', 'second-pair', { pocket: true }],
    ['9h Ad', 'Jc 9d 5c', 'second-pair', { kicker: 'top' }],
    ['7h 7s', 'Jc 9d 5c', 'third-pair', { pocket: true }],
    ['5h Kd', 'Jc 9d 5c', 'third-pair', { kicker: 'good' }],
    ['3h 3s', 'Jc 9d 5c', 'low-pair', { pocket: true }],
    ['Ah Kd', 'Jc 9d 5c', 'ace-high', { overcards: 2 }],
    ['Kh Qd', 'Jc 9d 5c', 'king-high', { overcards: 2 }],
    ['7h 6d', 'Jc 9d 5c', 'air', { overcards: 0 }],
  ] as const)('%s on %s is %s', (hole, board, made, extra) => {
    expect(cls(hole, board)).toMatchObject({ made, ...extra });
  });

  test('paired board: only what the hole cards add counts', () => {
    expect(cls('Ah Kd', 'Jc Jd 5c').made).toBe('ace-high'); // the board's pair is everyone's
    expect(cls('5h Kd', 'Jc Jd 5c').made).toBe('top-pair'); // top unpaired rank
    expect(cls('8h 8s', 'Jc Jd 5c')).toMatchObject({ made: 'top-pair', pocket: true });
    expect(cls('Jh Ad', 'Jc Jd 5c')).toMatchObject({ made: 'trips', kicker: 'top' });
    expect(cls('Jh Kd', 'Jc Jd 5c')).toMatchObject({ made: 'trips', kicker: 'good' });
    expect(cls('5h 5s', 'Jc Jd 5c').made).toBe('full-house');
    expect(cls('Jh Js', 'Jc Jd 5c').made).toBe('quads');
  });

  test('flushes and straights rank among what the board allows', () => {
    expect(cls('Ac 2c', 'Jc 9c 5c')).toMatchObject({ made: 'flush', level: 'nut' });
    expect(cls('Kc 2d', 'Jc 9c 5c 3c')).toMatchObject({ made: 'flush', level: 'second' });
    expect(cls('Qh Th', 'Jc 9d 5c')).toMatchObject({ made: 'air', straightDraw: 'open' });
    expect(cls('Qh Th', 'Jc 9d 8c')).toMatchObject({ made: 'straight', level: 'nut' });
    expect(cls('Th 7h', 'Jc 9d 8c')).toMatchObject({ made: 'straight', level: 'second' });
    expect(cls('7h 6h', 'Jc 9d 8c')).toMatchObject({ made: 'air', straightDraw: 'open' }); // a 5 or a T
    expect(cls('8h 7d', '6c 5d 4h')).toMatchObject({ made: 'straight', level: 'nut' });
    expect(cls('Ah 2d', '3c 4d 5h')).toMatchObject({ made: 'straight', level: 'third' }); // wheel; 7- and 6-high are possible
    expect(cls('9c 8c', '7c 6c 5c')).toMatchObject({ made: 'straight-flush', level: 'nut' });
  });

  test('a five-card board straight or flush that the hole cards do not improve is not theirs', () => {
    expect(cls('Ah Kd', '2c 3d 4h 5s 6c').made).toBe('ace-high');
    expect(cls('7d 2h', '2c 3d 4h 5s 6c').made).toBe('straight'); // 7 makes 7-high
    expect(cls('2d 3h', 'Ac Kc 9c 7c 4c').made).toBe('air');
    expect(cls('Qc 3h', 'Ac Kc 9c 7c 4c')).toMatchObject({ made: 'flush', level: 'nut' });
  });

  test("v2's two test cases, answered correctly", () => {
    // flush draw AND gutshot (v2 dropped the flush draw when it found the straight draw);
    // with A, K, Q of spades on the board the jack is the nut flush draw
    expect(cls('Js 3c', 'As Ks Qs 2h')).toMatchObject({ made: 'air', flushDraw: 'nut', straightDraw: 'gutshot' });
    // wheel on 2-3-4-5-K: 7-high and 6-high straights beat it, so it is third best (v2's test said second)
    expect(cls('Ad Ks', '2c 3d 4h 5s Kc')).toMatchObject({ made: 'straight', level: 'third' });
  });
});

describe('draws', () => {
  test.each([
    ['Ac Kc', 'Jc 9d 5c', { flushDraw: 'nut' }],
    ['Kc 2c', 'Jc 9d 5c', { flushDraw: 'second' }],
    ['8h 7h', 'Jc 9d 5c', { straightDraw: 'open' }], // double gutshot: 6 or T
    ['Kh Qd', 'Jc 9d 5c', { straightDraw: 'gutshot', straightDrawToNuts: true }],
    ['Th 8d', 'Jc 9d 5c', { straightDraw: 'open', straightDrawToNuts: false }], // a 7 makes the nut J-high, a Q only Q-high (KT makes K-high)
    ['Ah 2d', 'Kc 4d 3h', { straightDraw: 'gutshot' }], // wheel gutshot
    ['Qc Tc', 'Jc 9d 5h', { straightDraw: 'open', backdoorFlush: true }],
    ['Ah 7h', 'Kc 6d 2h', { backdoorFlush: true, backdoorStraight: false }],
    ['8h 7d', 'Kc 6d 2s', { backdoorStraight: true }],
  ] as const)('%s on %s', (hole, board, expected) => {
    expect(cls(hole, board)).toMatchObject(expected);
  });

  test('no draws on the river, nor for straights and better', () => {
    expect(cls('Ac Kc', 'Jc 9d 5c 2h 3s')).toMatchObject({ flushDraw: null, straightDraw: null });
    expect(cls('Qh Th', 'Jc 9d 8c')).toMatchObject({ flushDraw: null, straightDraw: null });
  });

  test('pairs keep their draws (pair + flush draw)', () => {
    expect(cls('Jc 7c', 'Jd 9c 5c')).toMatchObject({ made: 'top-pair', flushDraw: 'low' });
  });
});

describe('every combo on a flop', () => {
  const counts = (board: string) => {
    const all = classifyAll(cards(board));
    const out: Record<string, number> = {};
    for (const c of all) if (c) out[c.made] = (out[c.made] ?? 0) + 1;
    return { out, total: all.filter(Boolean).length };
  };

  test('Jc 9d 5c: counts worked out by hand', () => {
    const { out, total } = counts('Jc 9d 5c');
    expect(total).toBe(1176);
    expect(out).toEqual({
      set: 9,
      'two-pair': 27,
      overpair: 18,
      'top-pair': 120,
      'second-pair': 126, // 9x plus TT
      'third-pair': 138, // 5x plus 88, 77, 66
      'low-pair': 18, // 44, 33, 22
      'ace-high': 144,
      'king-high': 128,
      air: 448,
    });
  });

  test('a range summary: classes add up to the range, draws overlap them, equities average by weight', () => {
    const board = cards('Jc 9d 5c');
    const any = new Float32Array(1326).fill(1);
    const r = rangeClasses(board, any);
    expect(r.total).toBe(1176);
    expect(Object.values(r.made).reduce((s, x) => s + x.combos, 0)).toBe(1176);
    expect(r.made['top-pair'].combos).toBe(120);
    expect(r.draws['flush-draw'].combos).toBe(55); // two clubs in the hand: 11 choose 2
    expect(r.draws['nut-flush-draw'].combos).toBe(10); // Ac with any of the 10 other clubs
    const half = new Float32Array(1326).fill(0.5);
    const eq = new Float32Array(1326).fill(0.25);
    const r2 = rangeClasses(board, half, eq);
    expect(r2.made.set.combos).toBe(4.5);
    expect(r2.made.set.equity).toBeCloseTo(0.25, 9);
  });

  test('classes cover every combo exactly once, in the declared order of strength', () => {
    const { out, total } = counts('Ah Kh 7h');
    expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(total);
    for (const k of Object.keys(out)) expect(MADE_CLASSES).toContain(k);
  });
});
