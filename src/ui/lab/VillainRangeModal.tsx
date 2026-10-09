import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Card } from '../../core/cards';
import { CELLS, combosOfCell } from '../../core/ranges/hands';
import { SCENARIOS } from '../../core/ranges/library';
import { formatRange, parseRange, RangeSyntaxError } from '../../core/ranges/notation';
import { comboTotal, withoutCards, type Weights } from '../../core/ranges/range';
import { weightsFor, type ChartChoice, type Took } from '../../core/ranges/spot';
import { Button, Modal, Segmented, Toggle } from '../controls';
import { smartPaintCells } from '../ranges/brush';
import { RangeGrid, type Segment } from '../ranges/RangeGrid';

export const RANGE_COLOR = '#2f6fd6';

/** Grid fill for combo weights: each cell filled by the share of its combos in the range. */
export function weightSegments(weights: Weights): Segment[][] {
  return Array.from({ length: CELLS }, (_, cell) => {
    const combos = combosOfCell(cell);
    const share = combos.reduce((sum, c) => sum + weights[c]!, 0) / combos.length;
    return share > 0 ? [{ color: RANGE_COLOR, pct: Math.round(share * 100) }] : [];
  });
}

const PARTS: { value: Took | 'continue'; label: string }[] = [
  { value: 'raise', label: 'Raise' },
  { value: 'call', label: 'Call' },
  { value: 'continue', label: 'Raise + call' },
  { value: 'check', label: 'No raise' },
];

/**
 * God mode: paint what a player holds at this point of the hand. Starts from their current
 * range; any chart (or part of it) can be loaded, and the range can be typed as text.
 */
export function VillainRangeModal({
  title,
  spot,
  initial,
  dead,
  charts,
  canReset,
  onSave,
  onReset,
  onClose,
}: {
  title: string;
  /** The spot, under the title (lab/SpotLine). */
  spot?: ReactNode;
  initial: Weights;
  /** Cards Hero holds and the board shows: their combos can't be in the range. */
  dead: Card[];
  charts: readonly ChartChoice[];
  canReset: boolean;
  onSave: (rangeText: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [weights, setWeights] = useState<Weights>(initial);
  const [brush, setBrush] = useState(100);
  const [smart, setSmart] = useState(false);
  const [text, setText] = useState<string | null>(null); // null: follow the grid
  const [textError, setTextError] = useState<string | null>(null);
  const [chartId, setChartId] = useState('');
  const [part, setPart] = useState<Took | 'continue'>('raise');

  const fills = useMemo(() => weightSegments(weights), [weights]);
  const shown = text ?? formatRange(weights);
  const live = comboTotal(withoutCards(weights, dead));

  const paint = (cell: number, first: boolean) => {
    if (smart && !first) return;
    const next = weights.slice();
    for (const c of (smart ? smartPaintCells(cell) : [cell]).flatMap(combosOfCell)) next[c] = brush / 100;
    setWeights(next);
    setText(null);
  };

  const applyText = (value: string) => {
    setText(value);
    try {
      setWeights(parseRange(value));
      setTextError(null);
    } catch (e) {
      setTextError(e instanceof RangeSyntaxError ? e.message : String(e));
    }
  };

  const loadChart = () => {
    const chart = charts.find((c) => c.id === chartId);
    if (!chart) return;
    setWeights(weightsFor(chart.chart, part));
    setText(null);
    setTextError(null);
  };

  return (
    <Modal
      title={title}
      subtitle={spot}
      wide
      onClose={onClose}
      footer={
        <>
          {canReset && (
            <Button variant="ghost" onClick={onReset}>
              Back to the chart
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!!textError} onClick={() => onSave(formatRange(weights))}>
            Use this range
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-2">
          <RangeGrid fills={fills} onPaint={paint} cursor={smart ? 'crosshair' : 'pointer'} />
          <div className="text-sm text-muted">
            {comboTotal(weights).toFixed(1).replace(/\.0$/, '')} combos ({((comboTotal(weights) / 1326) * 100).toFixed(1)}% of hands)
            {dead.length > 0 && <span className="text-faint"> · {live.toFixed(1).replace(/\.0$/, '')} left after the known cards</span>}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">Brush</div>
            <label className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={brush}
                onChange={(e) => setBrush(Number(e.target.value))}
                className="grow"
                style={{ accentColor: RANGE_COLOR }}
                aria-label="Brush weight"
              />
              <span className="w-10 text-right font-mono text-xs">{brush}%</span>
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[100, 50, 25, 0].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBrush(v)}
                  className={`rounded border px-2 py-1 text-xs ${brush === v ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}
                >
                  {v === 0 ? 'Erase' : `${v}%`}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Toggle checked={smart} onChange={setSmart} label="Smart Paint" />
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">Start from a chart</div>
            <select
              value={chartId}
              onChange={(e) => setChartId(e.target.value)}
              className="mb-2 w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm text-ink"
              aria-label="Chart"
            >
              <option value="">Choose a chart…</option>
              {SCENARIOS.map((s) => {
                const list = charts.filter((c) => c.scenario === s);
                return list.length ? (
                  <optgroup key={s} label={s}>
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.mine ? '★ ' : ''}
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented size="sm" value={part} options={PARTS} onChange={setPart} />
              <Button variant="secondary" disabled={!chartId} onClick={loadChart}>
                Load
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">As text</div>
            <textarea
              value={shown}
              onChange={(e) => applyText(e.target.value)}
              rows={5}
              className={`w-full resize-y rounded-md border bg-surface-2 px-3 py-2 font-mono text-xs text-ink focus:outline-none ${
                textError ? 'border-danger' : 'border-line focus:border-accent'
              }`}
              aria-label="Range text"
            />
            {textError && <div className="mt-1 text-xs text-danger">{textError}</div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
