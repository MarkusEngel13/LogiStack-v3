/**
 * HHP's big buckets: what a hand can do on this board, in the words players use at the table.
 * "Can play for stacks" (sets, two pair, straights, strong flushes), thick value (overpairs, top
 * pair with a good kicker), thin value (weaker top pair, second pair), showdown value (lower pairs,
 * ace-high), draws, air. One main bucket per combo; a strong draw lifts a weak made hand into the
 * draw bucket, because that is how it plays (HHP: raise draws, call thin value).
 *
 * These buckets go by hand strength on the board. HHP's other split - value / showdown value /
 * bluff - depends on the opponent's range after their actions, so it comes from equity, not here.
 */

import type { Card } from './cards';
import { classifyAll, type ClassRow, type HandClass } from './handClass';

export const BUCKETS = ['cpfs', 'thick', 'thin', 'sdv', 'strong-draw', 'weak-draw', 'air'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABELS: Record<Bucket, string> = {
  cpfs: 'Can play for stacks',
  thick: 'Thick value',
  thin: 'Thin value',
  sdv: 'Showdown value',
  'strong-draw': 'Strong draw',
  'weak-draw': 'Weak draw',
  air: 'Air',
};

/** Flush draws and open-enders (double gutshots too) are strong, gutshots weak; backdoors don't count. */
export function drawTier(h: HandClass): 'strong' | 'weak' | null {
  if (h.flushDraw || h.straightDraw === 'open') return 'strong';
  if (h.straightDraw === 'gutshot') return 'weak';
  return null;
}

const strongKicker = (h: HandClass) => h.kicker === 'top' || h.kicker === 'good';
const strongLevel = (h: HandClass) => h.level === 'nut' || h.level === 'second';

/** The bucket of the made hand alone. */
export function madeBucket(h: HandClass): Exclude<Bucket, 'strong-draw' | 'weak-draw'> {
  switch (h.made) {
    case 'straight-flush':
    case 'quads':
    case 'full-house':
    case 'set':
    case 'two-pair':
      return 'cpfs';
    case 'flush':
    case 'straight':
      return strongLevel(h) ? 'cpfs' : 'thick';
    case 'trips':
      return strongKicker(h) ? 'cpfs' : 'thick';
    case 'overpair':
      return 'thick';
    case 'top-pair':
      // a pocket pair counts as top pair only under a paired board's pair (88 on J-J-5)
      return !h.pocket && strongKicker(h) ? 'thick' : 'thin';
    case 'second-pair':
      return 'thin';
    case 'third-pair':
    case 'low-pair':
    case 'ace-high':
      return 'sdv';
    case 'king-high':
    case 'air':
      return 'air';
  }
}

export function bucketOf(h: HandClass): Bucket {
  const made = madeBucket(h);
  const draw = drawTier(h);
  if (draw === 'strong' && (made === 'thin' || made === 'sdv' || made === 'air')) return 'strong-draw';
  if (draw === 'weak' && made === 'air') return 'weak-draw';
  return made;
}

/** Buckets of all 1326 combos on a board; null for combos that use a board card. */
export function bucketAll(board: readonly Card[]): (Bucket | null)[] {
  return classifyAll(board).map((h) => (h ? bucketOf(h) : null));
}

export interface RangeBuckets {
  /** Weighted combos left on this board. */
  total: number;
  rows: Record<Bucket, ClassRow>;
}

/** A range on a board by bucket, with each bucket's average equity when per-combo equities are given. */
export function rangeBuckets(board: readonly Card[], weights: Float32Array, equityOf?: Float32Array): RangeBuckets {
  const acc = Object.fromEntries(BUCKETS.map((k) => [k, { combos: 0, known: 0, sum: 0 }])) as Record<Bucket, { combos: number; known: number; sum: number }>;
  let total = 0;
  bucketAll(board).forEach((b, combo) => {
    const w = weights[combo]!;
    if (!b || !(w > 0)) return;
    total += w;
    const row = acc[b];
    row.combos += w;
    const e = equityOf?.[combo];
    if (e !== undefined && !Number.isNaN(e)) {
      row.known += w;
      row.sum += w * e;
    }
  });
  const rows = Object.fromEntries(
    BUCKETS.map((k) => [k, { combos: acc[k].combos, equity: acc[k].known > 0 ? acc[k].sum / acc[k].known : NaN }]),
  ) as Record<Bucket, ClassRow>;
  return { total, rows };
}
