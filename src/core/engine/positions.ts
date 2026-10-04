import type { SeatNo } from '../hand/types';

/**
 * Seats between the big blind and the button take their names from the END of this list
 * (v2 SDD §2.1, and the keys of the v2 range library): 6-max = LJ, HJ, CO; 10-max = all seven.
 */
const MIDDLE_NAMES = ['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO'];

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
  const names = MIDDLE_NAMES.slice(Math.max(0, MIDDLE_NAMES.length - rest.length));
  rest.forEach((seat, i) => labels.set(seat, names[i] ?? 'UTG'));
  return labels;
}
