/**
 * Heads-up preflop matchups up to suit symmetry. J♥T♥ vs J♠T♠ plays exactly like J♦T♦ vs J♣T♣,
 * so the 812,175 matchups of two distinct hands shrink to 47,008 classes, and the preflop table
 * stores one exact equity per class.
 *
 * A matchup's key is the smallest encoding over the 24 ways to relabel the suits. Cards are
 * Card52 (suit * 13 + rank). No imports, so build scripts can load this file directly in Node.
 */

const PERMS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  const permute = (a: number[], k: number) => {
    if (k === a.length) return void out.push([...a]);
    for (let i = k; i < a.length; i++) {
      [a[k], a[i]] = [a[i]!, a[k]!];
      permute(a, k + 1);
      [a[k], a[i]] = [a[i]!, a[k]!];
    }
  };
  permute([0, 1, 2, 3], 0);
  return out;
})();

const relabel = (card: number, perm: readonly number[]) => perm[Math.floor(card / 13)]! * 13 + (card % 13);

/** One hand as a number 0..2703, its higher card first. */
function handKey(a: number, b: number, perm: readonly number[]): number {
  const x = relabel(a, perm);
  const y = relabel(b, perm);
  return x > y ? x * 52 + y : y * 52 + x;
}

/**
 * Class of the matchup hero (h1 h2) vs villain (v1 v2), packed as key * 2 + flip.
 * `key` is the same for every suit relabelling; flip = 1 when hero is the second hand of the
 * class (the stored equity is the first hand's, so hero then gets 1 - equity).
 */
export function matchupClass(h1: number, h2: number, v1: number, v2: number): number {
  let best = Infinity;
  let flip = 0;
  for (const perm of PERMS) {
    const kh = handKey(h1, h2, perm);
    const kv = handKey(v1, v2, perm);
    const key = kh < kv ? kh * 2704 + kv : kv * 2704 + kh;
    if (key < best) {
      best = key;
      flip = kh < kv ? 0 : 1;
    }
  }
  return best * 2 + flip;
}

/** The four cards of a class key: first hand, then second hand. */
export function classCards(key: number): [number, number, number, number] {
  const first = Math.floor(key / 2704);
  const second = key % 2704;
  return [Math.floor(first / 52), first % 52, Math.floor(second / 52), second % 52];
}

/** Every class key, ascending (47,008 of them). */
export function allClassKeys(): Int32Array {
  const keys = new Set<number>();
  const hands: [number, number][] = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) hands.push([a, b]);
  for (let i = 0; i < hands.length; i++) {
    const [a, b] = hands[i]!;
    for (let j = i + 1; j < hands.length; j++) {
      const [c, d] = hands[j]!;
      if (a === c || a === d || b === c || b === d) continue;
      keys.add(Math.floor(matchupClass(a, b, c, d) / 2));
    }
  }
  return Int32Array.from([...keys].sort((x, y) => x - y));
}
