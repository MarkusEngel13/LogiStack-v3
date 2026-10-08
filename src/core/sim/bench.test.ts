import { test } from 'vitest';
import { nextHand } from '../hand/nextHand';
import type { StoryCache } from '../motives/story';
import { playHand, seeded } from './play';
import { libraryCharts, table } from './play.test';
/** Timing of the bots (SLOW=1 npm test): 30 hands at a 6-max table of mixed types, seeded. */
test.skipIf(!process.env.SLOW)('bench: postflop decision times', () => {
  const rand = seeded(42);
  const cache: StoryCache = new Map();
  let hand = table(['Reg', 'Fish', 'Nit', 'LAG', 'Whale', 'Maniac']);
  const post: number[] = [];
  const perHand: number[] = [];
  for (let i = 0; i < 30; i++) {
    const p = playHand(hand, libraryCharts, { rand, cache });
    const ms = p.moves.filter((m) => m.street !== 'preflop').map((m) => m.ms);
    post.push(...ms);
    perHand.push(ms.reduce((a, b) => a + b, 0));
    hand = nextHand(p.hand, p.steps.at(-1)!, { id: `h${i}`, createdAt: '', rand });
  }
  post.sort((a, b) => a - b);
  const q = (x: number) => post[Math.floor(x * (post.length - 1))]!.toFixed(0);
  console.log(`RESULT postflop decisions ${post.length}: median ${q(0.5)} ms, p90 ${q(0.9)} ms, max ${q(1)} ms; per hand avg ${(perHand.reduce((a, b) => a + b, 0) / perHand.length / 1000).toFixed(1)} s, worst ${(Math.max(...perHand) / 1000).toFixed(1)} s`);
}, 3_600_000);
