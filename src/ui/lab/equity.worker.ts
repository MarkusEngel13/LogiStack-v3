/**
 * Equity off the main thread. Heads-up: exact (the preflop table before the flop, every runout
 * after it). Multiway: Monte Carlo. The preflop table is fetched once, on first need.
 */

import tableUrl from '../../core/equity/preflop-hu.bin?url';
import { equityVsRange, monteCarloEquity } from '../../core/equity/equity';
import { PreflopTable } from '../../core/equity/preflopTable';
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

ctx.onmessage = async (e) => {
  const { id, hero, board, villains } = e.data;
  const answer = (a: Omit<EquityAnswer, 'id'>) => ctx.postMessage({ id, ...a });
  try {
    if (villains.length === 1) {
      const preflop = board.length === 0 ? await loadTable() : undefined;
      const r = equityVsRange(hero, board, villains[0]!, preflop);
      answer({ equity: r.equity, method: r.method, combos: [r.combos] });
    } else {
      const r = monteCarloEquity(hero, board, villains, { samples: 60_000, seed: 1 });
      answer({ equity: r.equity, method: 'monte-carlo', stdError: r.stdError });
    }
  } catch (err) {
    answer({ error: err instanceof Error ? err.message : String(err) });
  }
};
