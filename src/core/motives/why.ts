/**
 * Why a bucket acted as it did, in the model's own terms: the action taken against its best
 * rival, and the motives that tipped it (the score parts that differ most), plus how many next
 * cards hurt the hand. "Sets raised: fear of being outdrawn, 14 of 47 turn cards hurt them."
 */

import type { Bucket } from '../buckets';
import type { Motives } from './decide';
import type { StoryStep } from './story';

export const MOTIVE_WORDS: Record<keyof Motives, string> = {
  gain: 'greed: what it can win',
  loss: 'loss aversion: what it can lose',
  fear: 'fear of being outdrawn',
  trap: 'trapping: keeping worse hands in',
  tough: 'fear of a tough decision',
  embarrassment: 'embarrassment of a caught bluff',
  liking: 'habit: likes to bet, to call, or its usual size',
};

export interface BucketWhy {
  /** Option index the bucket preferred, and the one it preferred it over. */
  winner: number;
  loser: number;
  /** The preferred option is the action taken (else the bucket mostly did something else). */
  tookIt: boolean;
  /** Motives favouring the winner over the loser, biggest first, in pots. */
  reasons: { motive: keyof Motives; by: number }[];
  /** Next cards that bite into its lead (0 on the river), of `nextCards`. */
  scaryCards: number;
}

const score = (m: Motives) => m.gain + m.loss + m.fear + m.trap + m.tough + m.embarrassment + m.liking;

export function whyBucket(step: StoryStep, bucket: Bucket): BucketWhy | null {
  const row = step.byBucket[bucket];
  if (!row || step.taken < 0 || row.parts.length < 2) return null;
  const scores = row.parts.map(score);
  let rival = -1;
  scores.forEach((s, i) => {
    if (i !== step.taken && (rival < 0 || s > scores[rival]!)) rival = i;
  });
  const tookIt = scores[step.taken]! >= scores[rival]!;
  const [winner, loser] = tookIt ? [step.taken, rival] : [rival, step.taken];
  const reasons = (Object.keys(row.parts[winner]!) as (keyof Motives)[])
    .map((motive) => ({ motive, by: row.parts[winner]![motive] - row.parts[loser]![motive] }))
    .filter((r) => r.by > 0.005)
    .sort((a, b) => b.by - a.by);
  return { winner, loser, tookIt, reasons, scaryCards: Math.round(row.bites * step.nextCards) };
}
