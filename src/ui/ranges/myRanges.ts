import type { Scenario } from '../../core/ranges/library';
import type { ChartCells } from '../../core/ranges/range';

/**
 * Your own charts, kept in this browser (and synced). Library charts are never changed: Save on
 * one stores a copy here (basedOn = the library id). Only Save writes the cells, so only saved
 * charts sync, never a stroke in progress.
 */
export interface MyRange {
  id: string;
  label: string;
  scenario: Scenario;
  /** 10-max names, like the library. */
  positions: string[];
  stack: string;
  env: 'Live' | 'Online';
  playerType: string;
  cells: ChartCells;
  basedOn?: string;
  updatedAt: string;
}

const KEY = 'logistack.ranges.v1';

export function loadMyRanges(): MyRange[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as MyRange[]) : [];
  } catch {
    return [];
  }
}

function store(list: MyRange[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const saveMyRange = (r: MyRange) => store([...loadMyRanges().filter((x) => x.id !== r.id), r]);
export const deleteMyRange = (id: string) => store(loadMyRanges().filter((x) => x.id !== id));
