import { useEffect, useState } from 'react';
import type { Card } from '../../core/cards';
import type { FieldResult } from '../../core/equity/field';
import type { FearResult } from '../../core/fear';
import type { Weights } from '../../core/ranges/range';

/**
 * Hero's hand against villain ranges (the Lab), every player a range (the EQ page), or the fear
 * numbers of range a against range b (flop or turn).
 */
export type Question =
  | { kind: 'hero'; hero: Card[]; board: Card[]; villains: Weights[] }
  | { kind: 'field'; ranges: Weights[]; board: Card[] }
  | { kind: 'fear'; a: Weights; b: Weights; board: Card[] };

export type EquityQuestion = Question & { id: number };

export interface EquityAnswer {
  id: number;
  /** kind 'hero' */
  equity?: number;
  method?: 'table' | 'exact' | 'monte-carlo';
  /** Monte Carlo only. */
  stdError?: number;
  combos?: number[];
  /** kind 'field' */
  field?: FieldResult;
  /** kind 'fear' */
  fear?: FearResult;
  error?: string;
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (a: EquityAnswer) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./equity.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<EquityAnswer>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
  }
  return worker;
}

/**
 * The answer to an equity question, worked out in the background. `key` must change whenever
 * the question does (cards, board or any range); answers to older questions are ignored.
 */
export function useEquity(question: Question | null, key: string) {
  const [state, setState] = useState<{ key: string; answer: EquityAnswer | null }>({ key: '', answer: null });

  useEffect(() => {
    if (!question) return;
    let current = true;
    // a short pause, so stepping quickly through a hand doesn't queue up work
    const timer = setTimeout(() => {
      const id = nextId++;
      waiting.set(id, (answer) => current && setState({ key, answer }));
      getWorker().postMessage({ id, ...question } satisfies EquityQuestion);
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key]); // the key stands for the question

  const fresh = question !== null && state.key === key;
  return { answer: fresh ? state.answer : null, pending: question !== null && !fresh };
}
