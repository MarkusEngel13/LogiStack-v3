import { potTotal } from '../../core/engine/replay';
import type { LegalActions, TableState } from '../../core/engine/state';
import type { Chips } from '../../core/hand/types';

export interface SizePreset {
  label: string;
  /** Street total after the bet or raise ("raise to"). */
  to: Chips;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Smallest chip worth betting with: the gcd of the blinds (€0.10/€0.25 → €0.05, €1/€2 → €1). */
export const chipUnit = (sb: Chips, bb: Chips) => (sb > 0 ? gcd(sb, bb) : bb);

/**
 * Quick sizes for the bet/raise box:
 * - unopened preflop: 2× / 2.5× / 3× / 4× the biggest blind (straddle included)
 * - facing a bet or raise: 2.5× / 3× / 4× of it, plus a pot-size raise
 * - betting after the flop: ⅓ / ½ / ¾ pot and pot
 * Rounded to the chip unit and kept between the minimum raise and all-in (all-in has its own button).
 */
export function sizePresets(state: TableState, legal: LegalActions, sb: Chips): SizePreset[] {
  if (!legal.canBet && !legal.canRaise) return [];
  const unit = chipUnit(sb, state.rules.bb);
  const pot = potTotal(state);
  const out: SizePreset[] = [];
  const add = (label: string, raw: number) => {
    const to = Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(raw / unit) * unit));
    if (to < legal.maxTo && !out.some((p) => p.to === to)) out.push({ label, to });
  };

  if (legal.canBet) {
    add('⅓ pot', pot / 3);
    add('½ pot', pot / 2);
    add('¾ pot', (pot * 3) / 4);
    add('Pot', pot);
  } else if (state.street === 'preflop' && state.currentBet === state.blindLevel) {
    for (const m of [2, 2.5, 3, 4]) add(`${m}×`, m * state.blindLevel);
  } else {
    for (const m of [2.5, 3, 4]) add(`${m}×`, m * state.currentBet);
    // Pot-size raise: call first, then raise by the whole pot.
    add('Pot', state.currentBet + pot + legal.toCall);
  }
  return out;
}
