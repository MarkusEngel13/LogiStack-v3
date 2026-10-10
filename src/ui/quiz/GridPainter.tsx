import { useRef, useState } from 'react';
import { CELL_NAMES } from '../../core/ranges/hands';
import { Button } from '../controls';

export const BUCKET_COLORS: Record<string, string> = {
  value: '#dc2626',
  bluff: '#7c3aed',
  call: '#16a34a',
  fold: 'transparent',
};

/**
 * A 13×13 chart to paint: pick a bucket, tap or drag over hands (finger or mouse). After the
 * answer, each cell shows the chart's bucket, and the ones you got wrong are marked.
 */
export function GridPainter({
  buckets,
  answer,
  onSubmit,
}: {
  buckets: { id: string; label: string }[];
  /** The chart's cells, once answered. */
  answer?: string[] | undefined;
  onSubmit: (cells: string[]) => void;
}) {
  const [cells, setCells] = useState<string[]>(() => Array(169).fill('fold'));
  const [brush, setBrush] = useState(buckets[0]!.id);
  const painting = useRef<string | null>(null);
  const done = !!answer;

  const paintAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = el?.dataset.cell;
    if (cell === undefined || painting.current === null) return;
    const i = Number(cell);
    const what = painting.current;
    setCells((cs) => (cs[i] === what ? cs : cs.map((c, k) => (k === i ? what : c))));
  };

  return (
    <div className="space-y-3">
      {!done && (
        <div className="flex flex-wrap gap-2">
          {buckets.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBrush(b.id)}
              className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${brush === b.id ? 'border-accent bg-surface-3 font-semibold' : 'border-line bg-surface-2'}`}
            >
              <span className="h-3.5 w-3.5 rounded-sm border border-line" style={{ background: BUCKET_COLORS[b.id] }} />
              {b.label}
            </button>
          ))}
        </div>
      )}
      <div
        className="grid touch-none select-none gap-px rounded-md bg-line p-px"
        style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))', maxWidth: 560 }}
        onPointerDown={(e) => {
          if (done) return;
          const el = e.target as HTMLElement;
          const cell = el.dataset.cell;
          if (cell === undefined) return;
          // tapping a cell already in this bucket clears it back to fold
          painting.current = cells[Number(cell)] === brush ? 'fold' : brush;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          paintAt(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (painting.current !== null) paintAt(e.clientX, e.clientY);
        }}
        onPointerUp={() => (painting.current = null)}
        onPointerCancel={() => (painting.current = null)}
      >
        {CELL_NAMES.map((name, i) => {
          const shown = done ? answer![i]! : cells[i]!;
          const wrong = done && answer![i] !== cells[i];
          const color = BUCKET_COLORS[shown] ?? 'transparent';
          return (
            <div
              key={i}
              data-cell={i}
              className="relative flex aspect-square items-center justify-center overflow-hidden text-[8px] leading-none font-semibold sm:text-[11px]"
              style={{ background: color === 'transparent' ? 'var(--surface-2)' : color, color: color === 'transparent' ? 'var(--text-muted)' : '#fff' }}
            >
              <span className="pointer-events-none">{name}</span>
              {wrong && <span className="pointer-events-none absolute inset-0 border-2 border-yellow-300" title={`You: ${cells[i]}`} />}
            </div>
          );
        })}
      </div>
      {done ? (
        <p className="text-xs text-muted">The chart’s buckets; yellow frames are the hands you painted differently.</p>
      ) : (
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => onSubmit(cells)}>
            Check my chart
          </Button>
          <Button variant="ghost" onClick={() => setCells(Array(169).fill('fold'))}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
