import type { SeatNo } from '../hand/types';

/**
 * Seats between the big blind and the button (Marius's convention, 2026-10-05): counting back from
 * the button they are CO, HJ, LJ; any seats before those are UTG, UTG+1, UTG+2, ... from the first
 * to act. 6-max = LJ HJ CO, 8-max = UTG UTG+1 LJ HJ CO, 9-max = UTG UTG+1 UTG+2 LJ HJ CO.
 */
const LATE_NAMES = ['LJ', 'HJ', 'CO'];

function middleNames(n: number): string[] {
  if (n <= LATE_NAMES.length) return LATE_NAMES.slice(LATE_NAMES.length - n);
  const early = Array.from({ length: n - LATE_NAMES.length }, (_, i) => (i === 0 ? 'UTG' : `UTG+${i}`));
  return [...early, ...LATE_NAMES];
}

/**
 * @param order dealt-in seats clockwise, starting with the small blind
 *              (heads-up: the button, who posts the small blind)
 * @param buttonDealtIn false when the button sits on an empty or sitting-out seat (dead button)
 */
export function positionLabels(order: readonly SeatNo[], buttonDealtIn: boolean): Map<SeatNo, string> {
  const labels = new Map<SeatNo, string>();
  if (order.length === 2) {
    labels.set(order[0]!, 'BTN');
    labels.set(order[1]!, 'BB');
    return labels;
  }
  labels.set(order[0]!, 'SB');
  labels.set(order[1]!, 'BB');
  const rest = order.slice(2);
  if (buttonDealtIn && rest.length > 0) labels.set(rest.pop()!, 'BTN');
  const names = middleNames(rest.length);
  rest.forEach((seat, i) => labels.set(seat, names[i]!));
  return labels;
}
