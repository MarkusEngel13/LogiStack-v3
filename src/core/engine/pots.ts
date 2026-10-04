import type { Chips, SeatNo } from '../hand/types';
import type { Pot } from './state';

export interface Contribution {
  seat: SeatNo;
  /** Live chips put in (antes excluded). */
  amount: Chips;
  /** Still contesting the pot (not folded, not mucked). */
  live: boolean;
}

/**
 * Splits contributions into a main pot and side pots.
 * Each level is set by the smallest live contribution still open; folded money fills the levels
 * it reaches but never makes its owner eligible. Dead money (antes) is added by the caller.
 */
export function buildPots(contributions: readonly Contribution[]): Pot[] {
  const open = contributions.map((c) => ({ ...c }));
  const pots: Pot[] = [];

  while (open.some((c) => c.amount > 0)) {
    const liveOpen = open.filter((c) => c.live && c.amount > 0);
    if (liveOpen.length === 0) {
      // Only folded money left above every live player: it joins the last pot.
      const rest = open.reduce((sum, c) => sum + c.amount, 0);
      const last = pots[pots.length - 1];
      if (last) last.amount += rest;
      else pots.push({ amount: rest, eligible: [] });
      break;
    }
    const level = Math.min(...liveOpen.map((c) => c.amount));
    let amount = 0;
    for (const c of open) {
      const take = Math.min(c.amount, level);
      amount += take;
      c.amount -= take;
    }
    pots.push({ amount, eligible: liveOpen.map((c) => c.seat).sort((a, b) => a - b) });
  }

  // Levels with the same contenders are one pot.
  const merged: Pot[] = [];
  for (const pot of pots) {
    const prev = merged[merged.length - 1];
    if (prev && prev.eligible.join() === pot.eligible.join()) prev.amount += pot.amount;
    else merged.push({ ...pot });
  }
  return merged;
}
