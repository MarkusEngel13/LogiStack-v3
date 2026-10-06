/**
 * Equity off the main thread.
 * - 'hero': a hand against villain ranges. Heads-up exact (the preflop table before the flop,
 *   every runout after it), multiway Monte Carlo.
 * - 'field': every player a range. Two players exact, more by Monte Carlo.
 * - 'fear': fear numbers of one range against another, on a flop or turn.
 * - 'story': every postflop action of a hand through the motive model (ranges narrowed).
 * The preflop table is fetched once, on first need.
 */

import tableUrl from '../../core/equity/preflop-hu.bin?url';
import { equityVsRange, monteCarloEquity } from '../../core/equity/equity';
import { monteCarloField, rangeVsRange } from '../../core/equity/field';
import { PreflopTable } from '../../core/equity/preflopTable';
import { fearNumbers } from '../../core/fear';
import { runStory, type StoryCache } from '../../core/motives/story';
import type { EquityAnswer, EquityQuestion } from './useEquity';

// The app compiles with the DOM types; inside the worker only these two are needed.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<EquityQuestion>) => void) | null;
  postMessage(message: EquityAnswer): void;
};

let table: Promise<PreflopTable> | null = null;
const loadTable = () =>
  (table ??= fetch(tableUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`preflop table: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => PreflopTable.fromBuffer(buf)));

/** Decisions already made, so entering one more action only costs one more (kept small). */
const storyCache: StoryCache = new Map();

ctx.onmessage = async (e) => {
  const q = e.data;
  const answer = (a: Omit<EquityAnswer, 'id'>) => ctx.postMessage({ id: q.id, ...a });
  try {
    if (q.kind === 'story') {
      if (storyCache.size > 400) storyCache.clear();
      answer({ story: runStory(q.input, storyCache) });
    } else if (q.kind === 'fear') {
      answer({ fear: fearNumbers(q.a, q.b, q.board) });
    } else if (q.kind === 'field') {
      if (q.ranges.length === 2) {
        const preflop = q.board.length === 0 ? await loadTable() : undefined;
        answer({ field: rangeVsRange(q.ranges[0]!, q.ranges[1]!, q.board, preflop) });
      } else {
        answer({ field: monteCarloField(q.ranges, q.board, { samples: 200_000, seed: 1 }) });
      }
    } else if (q.villains.length === 1) {
      const preflop = q.board.length === 0 ? await loadTable() : undefined;
      const r = equityVsRange(q.hero, q.board, q.villains[0]!, preflop);
      answer({ equity: r.equity, method: r.method, combos: [r.combos] });
    } else {
      const r = monteCarloEquity(q.hero, q.board, q.villains, { samples: 60_000, seed: 1 });
      answer({ equity: r.equity, method: 'monte-carlo', stdError: r.stdError });
    }
  } catch (err) {
    answer({ error: err instanceof Error ? err.message : String(err) });
  }
};
