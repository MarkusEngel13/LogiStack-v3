/**
 * Equity off the main thread.
 * - 'hero': a hand against villain ranges. Heads-up exact (the preflop table before the flop,
 *   every runout after it), multiway Monte Carlo.
 * - 'field': every player a range. Two players exact, more by Monte Carlo.
 * - 'fear': fear numbers of one range against another, on a flop or turn.
 * - 'story': every postflop action of a hand through the motive model (ranges narrowed).
 * - 'sizes': the size explorer for the player to act.
 * - 'whatif': each line of the player to act and what reaches the next street.
 * - 'bot': the action of a bot holding real cards (after the flop).
 * - 'preview': what a player style does in the Players page's fixed spots.
 * The preflop table is fetched once, on first need.
 */

import tableUrl from '../../core/equity/preflop-hu.bin?url';
import { equityVsRange, monteCarloEquity } from '../../core/equity/equity';
import { monteCarloField, rangeVsRange } from '../../core/equity/field';
import { PreflopTable } from '../../core/equity/preflopTable';
import { fearNumbers } from '../../core/fear';
import { botChoice } from '../../core/motives/bot';
import { exploreSizes } from '../../core/motives/sizes';
import { runStory, type StoryCache } from '../../core/motives/story';
import { whatIf } from '../../core/motives/whatIf';
import { POSTFLOP_SPOTS, postflopRow, type PostflopRow } from '../../core/players/preview';
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
/** Preview rows per profile and spot: dragging a slider back costs nothing. */
const previewCache = new Map<string, PostflopRow>();

ctx.onmessage = async (e) => {
  const q = e.data;
  const answer = (a: Omit<EquityAnswer, 'id'>) => ctx.postMessage({ id: q.id, ...a });
  try {
    if (q.kind === 'preview') {
      if (previewCache.size > 500) previewCache.clear();
      const key = JSON.stringify(q.profile);
      answer({
        preview: POSTFLOP_SPOTS.map((spot) => {
          const k = `${spot}:${key}`;
          let row = previewCache.get(k);
          if (!row) previewCache.set(k, (row = postflopRow(q.profile, spot)));
          return row;
        }),
      });
    } else if (q.kind === 'bot') {
      if (storyCache.size > 400) storyCache.clear();
      answer({ bot: botChoice(q.input, q.state, q.step, Math.random, storyCache, true) });
    } else if (q.kind === 'whatif') {
      answer({ whatIf: whatIf(q.q) });
    } else if (q.kind === 'sizes') {
      answer({ sizes: exploreSizes(q.q) });
    } else if (q.kind === 'story') {
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
