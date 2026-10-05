import type { ActionMix, ChartAction } from '../../core/ranges/range';

/**
 * Move one brush slider. Fold (the unpainted rest) gives way first; only when the three actions
 * would pass 100 % do the other two shrink, in proportion. (v2 always squeezed the others to a
 * total of 100, so "raise 50 / call 30 / fold 20" could not be painted.)
 */
export function setBrushAction(brush: ActionMix, action: ChartAction, value: number): ActionMix {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const next = { ...brush, [action]: v };
  const others = (['allin', 'raise', 'call'] as const).filter((a) => a !== action);
  const otherTotal = others.reduce((sum, a) => sum + next[a], 0);
  if (v + otherTotal <= 100) return next;

  const room = 100 - v;
  let used = 0;
  others.forEach((a, i) => {
    const share = i === others.length - 1 ? room - used : Math.floor((next[a] * room) / otherTotal);
    next[a] = share;
    used += share;
  });
  return next;
}

/**
 * Smart Paint (v2): the hand clicked plus every better hand of its line, in grid cells
 * (row/column 0 = ace).
 * - pair: up the diagonal to AA (55 → 66 … AA)
 * - suited connector: up the diagonal to AKs (98s → T9s … AKs)
 * - other suited: along the row to the diagonal (K9s → KTs, KJs, KQs)
 * - offsuit: up the column to the diagonal (A9o → ATo … AKo)
 */
export function smartPaintCells(cell: number): number[] {
  const row = Math.floor(cell / 13);
  const col = cell % 13;
  const out: number[] = [];
  if (row === col) {
    for (let i = row; i >= 0; i--) out.push(i * 13 + i);
  } else if (row < col) {
    if (col - row === 1) {
      for (let r = row, c = col; r >= 0; r--, c--) out.push(r * 13 + c);
    } else {
      for (let c = col; c > row; c--) out.push(row * 13 + c);
    }
  } else {
    for (let r = row; r > col; r--) out.push(r * 13 + col);
  }
  return out;
}
