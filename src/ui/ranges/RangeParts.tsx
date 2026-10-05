import { CELL_NAMES, comboLabel, combosOfCell } from '../../core/ranges/hands';
import { chartShares, type ActionMix, type Chart } from '../../core/ranges/range';
import { ACTION_COLORS, ACTION_LABELS, mixSegments } from './RangeGrid';

/** v2's stats bar: share of all 1326 combos per action, the text shrinking with the space. */
export function StatsBar({ chart }: { chart: Chart }) {
  const s = chartShares(chart);
  const parts = [
    ...(['allin', 'raise', 'call'] as const).map((a) => ({ key: a, label: ACTION_LABELS[a], share: s[a], bg: ACTION_COLORS[a], fg: '#ffffff' })),
    { key: 'fold', label: 'Fold', share: s.fold, bg: 'var(--surface-3)', fg: 'var(--text-muted)' },
  ].filter((p) => p.share > 0.0004);

  const text = (label: string, share: number) => {
    const pct = share * 100;
    const combos = Math.round(share * 1326);
    if (pct < 5) return '';
    if (pct < 15) return `${pct.toFixed(1)}%`;
    if (pct < 30) return `${pct.toFixed(1)}% (${combos})`;
    return `${label} ${pct.toFixed(1)}% (${combos} combos)`;
  };

  return (
    <div className="flex h-7 w-full overflow-hidden rounded-md text-xs leading-7 font-bold">
      {parts.map((p) => (
        <div
          key={p.key}
          className="overflow-hidden text-center whitespace-nowrap"
          style={{ width: `${p.share * 100}%`, background: p.bg, color: p.fg }}
          title={`${p.label}: ${(p.share * 100).toFixed(2)}% (${(p.share * 1326).toFixed(1)} combos)`}
        >
          {text(p.label, p.share)}
        </div>
      ))}
    </div>
  );
}

/** The combos behind a hovered cell, painted with the cell's action mix. */
export function ComboPopup({ cell, mix, x, y }: { cell: number; mix: ActionMix; x: number; y: number }) {
  const combos = combosOfCell(cell);
  const cols = combos.length === 12 ? 4 : combos.length === 6 ? 3 : 2;
  const width = cols * 54 + 24;
  const height = Math.ceil(combos.length / cols) * 30 + 60;
  const left = Math.max(8, Math.min(x + 18, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y + 18, window.innerHeight - height - 8));
  const segments = mixSegments(mix);
  let at = 0;
  const stops = segments.map((s) => `${s.color} ${at}% ${(at += s.pct)}%`);
  const background = at > 0 ? `linear-gradient(to right, ${stops.join(', ')}, var(--surface-3) ${at}% 100%)` : 'var(--surface-3)';
  const fold = Math.max(0, 100 - mix.raise - mix.call - mix.allin);

  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg border border-line bg-surface p-3 shadow-2xl"
      style={{ left, top, width }}
    >
      <div className="mb-2 flex items-baseline justify-between border-b border-line pb-1.5">
        <span className="text-base font-bold">{CELL_NAMES[cell]}</span>
        <span className="text-xs text-muted">
          {[...(['allin', 'raise', 'call'] as const).filter((a) => mix[a] > 0).map((a) => `${ACTION_LABELS[a]} ${mix[a]}%`), fold > 0 ? `Fold ${fold}%` : '']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {combos.map((combo) => (
          <div
            key={combo}
            className="rounded px-1 py-1 text-center font-mono text-xs"
            style={{ background, color: at > 0 ? '#ffffff' : 'var(--text-muted)' }}
          >
            {comboLabel(combo, true)}
          </div>
        ))}
      </div>
    </div>
  );
}
