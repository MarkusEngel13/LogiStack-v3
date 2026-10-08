import { describe, expect, test } from 'vitest';
import { bucketAll, BUCKETS } from '../buckets';
import { parseCards } from '../cards';
import { aheadNow } from '../fear';
import { parseRange } from '../ranges/notation';
import { fromParts, partsByGroup, rangeEquity } from './field';

const btn = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
const bb = parseRange('22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o');

function close(a: Float32Array, b: Float32Array) {
  let worst = 0;
  for (let c = 0; c < 1326; c++) {
    if (Number.isNaN(a[c]!) || Number.isNaN(b[c]!)) {
      expect(Number.isNaN(a[c]!), `combo ${c}`).toBe(Number.isNaN(b[c]!));
      continue;
    }
    worst = Math.max(worst, Math.abs(a[c]! - b[c]!));
  }
  expect(worst).toBeLessThan(1e-5);
}

describe('equity by bucket in one pass', () => {
  for (const board of ['Js 9d 2s', 'Ac 7d 2h 5s', 'Kd 8c 4h 2s Ts']) {
    const cards = parseCards(board.split(' '));
    const buckets = bucketAll(cards);
    const group = buckets.map((b) => (b ? BUCKETS.indexOf(b) : -1));
    const G = BUCKETS.length;

    test(`${board}: all groups = rangeEquity, and aheadNow`, () => {
      close(fromParts(partsByGroup(btn, bb, cards, group, G, true), new Array(G).fill(1)), rangeEquity(btn, bb, cards));
      close(fromParts(partsByGroup(btn, bb, cards, group, G, false), new Array(G).fill(1)), aheadNow(btn, bb, cards));
    });

    test(`${board}: re-weighted groups = rangeEquity against the re-weighted range`, () => {
      const k = [1, 0.8, 0.5, 0.3, 0.6, 0.2, 0.05];
      const cont = new Float32Array(1326);
      for (let c = 0; c < 1326; c++) if (group[c]! >= 0) cont[c] = bb[c]! * k[group[c]!]!;
      close(fromParts(partsByGroup(btn, bb, cards, group, G, true), k), rangeEquity(btn, cont, cards));
      close(fromParts(partsByGroup(btn, bb, cards, group, G, false), k), aheadNow(btn, cont, cards));
    });
  }
});

describe('a bot deciding from its one hand', () => {
  test("gets exactly the whole range's chances for that hand", async () => {
    const { decide } = await import('../motives/decide');
    const { MOTIVE_PRESETS } = await import('../motives/profile');
    const { comboIndex } = await import('../cards');
    const board = parseCards('Js 9d 2s'.split(' '));
    const s = { board, pot: 550, toCall: 275, stack: 9700, oppStack: 9425, bb: 100, inPosition: false };
    const full = decide(MOTIVE_PRESETS.Fish!, s, bb, btn);
    for (const hand of ['Qs Ts', 'Jh Th', '9c 9h', 'Ah 3h']) {
      const [a, b] = parseCards(hand.split(' '));
      const c = comboIndex(a!, b!);
      const one = new Float32Array(1326);
      one[c] = 1;
      const single = decide(MOTIVE_PRESETS.Fish!, s, one, btn);
      full.options.forEach((_, i) => expect(single.probs[i]![c]!).toBeCloseTo(full.probs[i]![c]!, 6));
    }
  }, 30_000);
});
