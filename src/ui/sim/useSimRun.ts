import { useEffect, useRef, useState } from 'react';
import type { Counts } from '../../core/sim/stats';
import { addBatch, type SimTable } from '../../core/sim/table';
import type { ChartChoice } from '../../core/ranges/spot';
import { ask } from '../lab/useEquity';

export interface SimResult {
  counts: Record<string, Counts>;
  /** Seat 0's result per hand, in big blinds. */
  nets: number[];
}

export interface SimRun {
  running: boolean;
  /** Hands played per table so far. */
  done: number;
  total: number;
  results: SimResult[];
  error?: string;
}

const BATCH = 5;

/**
 * Bot hands in the background worker for one or more tables, batch by batch and table by table
 * (so two tables of an exploit check always have the same hands played), with progress and stop.
 */
export function useSimRun() {
  const [run, setRun] = useState<SimRun>({ running: false, done: 0, total: 0, results: [] });
  const stopRef = useRef(false);
  useEffect(() => () => void (stopRef.current = true), []);

  const start = async (tables: SimTable[], hands: number, charts: ChartChoice[]) => {
    stopRef.current = false;
    let results: SimResult[] = tables.map(() => ({ counts: {}, nets: [] }));
    setRun({ running: true, done: 0, total: hands, results });
    for (let from = 0; from < hands && !stopRef.current; from += BATCH) {
      const to = Math.min(hands, from + BATCH);
      const next: SimResult[] = [];
      for (let k = 0; k < tables.length; k++) {
        const a = await ask({ kind: 'sim', table: tables[k]!, from, to, charts });
        if (!a.sim) {
          setRun((r) => ({ ...r, running: false, error: a.error ?? 'The run stopped.' }));
          return;
        }
        next.push({ counts: addBatch(results[k]!.counts, a.sim.counts), nets: [...results[k]!.nets, ...a.sim.nets] });
      }
      results = next;
      setRun({ running: true, done: to, total: hands, results });
    }
    setRun((r) => ({ ...r, running: false }));
  };

  return { run, start, stop: () => void (stopRef.current = true) };
}

/** Mean and standard error of a list (bb per hand). */
export function meanSe(xs: readonly number[]): { mean: number; se: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, se: 0 };
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  const v = n > 1 ? xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, se: Math.sqrt(v / n) };
}
