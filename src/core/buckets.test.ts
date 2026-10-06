import { describe, expect, test } from 'vitest';
import { BUCKETS, bucketOf, rangeBuckets } from './buckets';
import { parseCards } from './cards';
import { classifyHand } from './handClass';
import { parseRange } from './ranges/notation';

const cards = (text: string) => parseCards(text.split(' '));
const bucket = (hole: string, board: string) => {
  const [a, b] = cards(hole);
  return bucketOf(classifyHand([a!, b!], cards(board)));
};

describe('buckets on a wet flop (J♠ 9♦ 2♠)', () => {
  const board = 'Js 9d 2s';
  test.each([
    ['Jh Jd', 'cpfs'], // top set
    ['9h 8h', 'thin'], // second pair, no draw
    ['Jh 9h', 'cpfs'], // top two pair
    ['Ah Ad', 'thick'], // overpair
    ['Ah Jd', 'thick'], // top pair, top kicker
    ['Kh Jd', 'thick'], // top pair, good kicker
    ['Jd 3h', 'thin'], // top pair, weak kicker
    ['5h 5d', 'sdv'], // low pocket pair
    ['Ah Kd', 'sdv'], // ace-high
    ['Th 8d', 'strong-draw'], // open-ender (Q or 7)
    ['Ks 4s', 'strong-draw'], // flush draw
    ['9s 8s', 'strong-draw'], // second pair + flush draw plays as a draw
    ['As Js', 'thick'], // top pair + nut flush draw stays value
    ['Kh Qd', 'weak-draw'], // king-high + gutshot (T)
    ['7h 6d', 'air'],
  ] as const)('%s is %s', (hole, expected) => {
    expect(bucket(hole, board)).toBe(expected);
  });
});

describe('made hands and boards', () => {
  test('straights and flushes by level', () => {
    expect(bucket('Ks Qs', 'As Ts 4s')).toBe('cpfs'); // second-nut flush
    expect(bucket('5s 3s', 'As Ts 4s Kd')).toBe('thick'); // low flush
    expect(bucket('Qh Td', 'Kc Jd 9s')).toBe('cpfs'); // the nut straight
  });

  test('paired boards: trips by kicker, a pocket pair under the board pair is thin', () => {
    expect(bucket('Jh Ad', 'Jc Jd 5c')).toBe('cpfs');
    expect(bucket('Jh 3d', 'Jc Jd 5c')).toBe('thick');
    expect(bucket('8h 8s', 'Jc Jd 5c')).toBe('thin');
  });

  test('no draws on the river', () => {
    expect(bucket('Ks 4s', 'Js 9d 2s 3c Th')).toBe('air'); // king-high, the flush missed
  });
});

test('rangeBuckets adds up to the range and averages equity by bucket', () => {
  const board = cards('Js 9d 2s');
  const range = parseRange('22+, AJs+, KQs, AQo+');
  const equity = new Float32Array(1326).fill(0.5);
  const r = rangeBuckets(board, range, equity);
  const sum = BUCKETS.reduce((s, k) => s + r.rows[k].combos, 0);
  expect(sum).toBeCloseTo(r.total, 6);
  expect(r.rows.cpfs.combos).toBe(9); // JJ, 99, 22: three combos each
  expect(r.rows.cpfs.equity).toBeCloseTo(0.5, 6);
  expect(Number.isNaN(r.rows.air.equity)).toBe(true); // no air in this range
});
