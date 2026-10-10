import { memo, useRef, useState, type PointerEvent } from 'react';
import { useTouchScreen } from '../touch';
import { CELL_NAMES, CELLS } from '../../core/ranges/hands';
import type { ActionMix, Chart } from '../../core/ranges/range';

/** Action colours, matching the action tags on the table. */
export const ACTION_COLORS = { allin: '#7f1414', raise: '#c62828', call: '#1f8a4c' } as const;
export const ACTION_LABELS = { allin: 'All-in', raise: 'Raise', call: 'Call' } as const;

/** One cell's painting, left to right; the rest of the cell stays empty (fold). */
export type Segment = { color: string; pct: number };

export const mixSegments = (mix: ActionMix): Segment[] =>
  (['allin', 'raise', 'call'] as const).filter((a) => mix[a] > 0).map((a) => ({ color: ACTION_COLORS[a], pct: mix[a] }));

export const chartSegments = (chart: Chart): Segment[][] => chart.map(mixSegments);

const cellFromPoint = (x: number, y: number): number | null => {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]');
  return el ? Number(el.dataset.cell) : null;
};

/**
 * The 13x13 chart. Click or drag to paint with a mouse or pen; hovering reports the cell for the
 * combo pop-up. A finger never paints by accident: on a touch screen the grid starts as a picture
 * (the page scrolls over it, a tap shows a cell) and paints only after "✏ Edit", with a coloured
 * frame and "Done" until you stop. Without onPaint it's read-only everywhere. It fills its width;
 * on a phone that is 13 cells of ~27 px.
 */
export function RangeGrid({
  fills,
  onPaint,
  onPaintEnd,
  onHover,
  dimmed = false,
  cursor = 'pointer',
}: {
  fills: readonly Segment[][];
  /** A cell under the pointer while painting; `first` for the cell where the stroke began. */
  onPaint?: (cell: number, first: boolean) => void;
  onPaintEnd?: () => void;
  onHover?: (cell: number | null, x: number, y: number) => void;
  dimmed?: boolean;
  cursor?: string;
}) {
  const painting = useRef(false);
  const lastCell = useRef<number | null>(null);
  const touchScreen = useTouchScreen();
  const [editing, setEditing] = useState(false);
  const paintable = !!onPaint;
  // a finger paints only in edit mode; a mouse or pen always
  const fingerPaints = paintable && (!touchScreen || editing);
  const editable = fingerPaints;

  const down = (e: PointerEvent<HTMLDivElement>) => {
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell === null) return;
    if (!paintable || (e.pointerType === 'touch' && !editing)) {
      if (e.pointerType === 'touch') onHover?.(cell, e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    painting.current = true;
    lastCell.current = cell;
    onHover?.(null, 0, 0);
    onPaint(cell, true);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (painting.current) {
      if (cell !== null && cell !== lastCell.current) {
        lastCell.current = cell;
        onPaint?.(cell, false);
      }
    } else if (e.pointerType !== 'touch') {
      onHover?.(cell, e.clientX, e.clientY);
    }
  };
  const up = () => {
    if (!painting.current) return;
    painting.current = false;
    lastCell.current = null;
    onPaintEnd?.();
  };

  const grid = (
    <div
      className={`grid w-full gap-px rounded-md border bg-line p-px select-none ${touchScreen && editing ? 'border-accent outline-2 outline-accent' : 'border-line'}`}
      style={{
        gridTemplateColumns: 'repeat(13, minmax(0, 1fr))',
        aspectRatio: '1 / 1',
        containerType: 'inline-size',
        cursor: paintable ? cursor : 'default',
        opacity: dimmed ? 0.75 : 1,
        // painting: a finger drags the brush, not the page (and no long-press menu)
        touchAction: editable ? 'none' : undefined,
        WebkitTouchCallout: editable ? 'none' : undefined,
        WebkitTapHighlightColor: 'transparent',
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      // a tapped cell stays shown (a finger leaves the grid when it lifts)
      onPointerLeave={(e) => e.pointerType !== 'touch' && onHover?.(null, 0, 0)}
    >
      {Array.from({ length: CELLS }, (_, cell) => (
        <Cell key={cell} cell={cell} segments={fills[cell] ?? []} fillKey={keyOf(fills[cell])} />
      ))}
    </div>
  );
  if (!paintable || !touchScreen) return grid;
  return (
    <div className="space-y-1.5">
      <div className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${editing ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>
        <span>{editing ? 'Painting: a finger paints the cells' : 'Scroll freely · tap a cell to see it'}</span>
        <button
          type="button"
          onClick={() => {
            setEditing((v) => !v);
            onHover?.(null, 0, 0);
          }}
          className={`min-h-9 rounded-md px-3 font-semibold ${editing ? 'bg-black/20' : 'border border-line bg-surface text-ink'}`}
        >
          {editing ? 'Done' : '✏ Edit'}
        </button>
      </div>
      {grid}
    </div>
  );
}

const keyOf = (segments: Segment[] | undefined) => (segments ?? []).map((s) => `${s.color}${s.pct}`).join('|');

const Cell = memo(
  function Cell({ cell, segments }: { cell: number; segments: Segment[]; fillKey: string }) {
    let at = 0;
    const stops = segments.map((s) => {
      const from = at;
      at += s.pct;
      return `${s.color} ${from}% ${at}%`;
    });
    const painted = at > 0;
    return (
      <div
        data-cell={cell}
        className="flex items-start justify-start overflow-hidden rounded-[2px] font-bold"
        style={{
          padding: '0.5cqw 0 0 0.7cqw',
          fontSize: '2.3cqw',
          lineHeight: 1.1,
          background: painted
            ? `linear-gradient(to right, ${stops.join(', ')}, var(--surface-2) ${at}% 100%)`
            : 'var(--surface-2)',
          color: painted ? '#ffffff' : 'var(--text-faint)',
          textShadow: painted ? '0 1px 1px rgba(0,0,0,0.6)' : undefined,
        }}
      >
        {CELL_NAMES[cell]}
      </div>
    );
  },
  (a, b) => a.cell === b.cell && a.fillKey === b.fillKey,
);
