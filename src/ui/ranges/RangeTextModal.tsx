import { useMemo, useState } from 'react';
import { CELLS, combosOfCell } from '../../core/ranges/hands';
import { formatRange, parseRange, RangeSyntaxError } from '../../core/ranges/notation';
import { chartWeights, comboTotal, type ActionMix, type Chart } from '../../core/ranges/range';
import { Button, Modal } from '../controls';
import { ACTION_COLORS, ACTION_LABELS } from './RangeGrid';

const brushText = (b: ActionMix) =>
  (['allin', 'raise', 'call'] as const)
    .filter((a) => b[a] > 0)
    .map((a) => `${ACTION_LABELS[a]} ${b[a]}%`)
    .join(' / ') || 'Fold';

/**
 * Range text in and out. Out: one line of text per action. In: paste a range (Equilab-style text)
 * and paint those hands with the current brush; a weight scales the brush (KQo:0.5 with a
 * raise-100 % brush paints raise 50 %).
 */
export function RangeTextModal({
  chart,
  brush,
  onPaint,
  onClose,
}: {
  chart: Chart;
  brush: ActionMix;
  /** Per cell, the share of its combos in the pasted text (0..1); 0 leaves the cell alone. */
  onPaint: (cellShares: number[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return { weights: parseRange(text) };
    } catch (e) {
      return { error: e instanceof RangeSyntaxError ? e.message : String(e) };
    }
  }, [text]);

  const exports = (['allin', 'raise', 'call'] as const)
    .map((a) => ({ action: a, text: formatRange(chartWeights(chart, [a])) }))
    .filter((x) => x.text);

  const copy = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(() => setCopied(key));
  };

  const paint = () => {
    if (!parsed?.weights) return;
    const shares = Array.from({ length: CELLS }, (_, cell) => {
      const combos = combosOfCell(cell);
      return combos.reduce((sum, c) => sum + parsed.weights![c]!, 0) / combos.length;
    });
    onPaint(shares);
    onClose();
  };

  return (
    <Modal title="Range as text" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-5">
        <div>
          <div className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">This chart</div>
          {exports.length === 0 && <div className="text-sm text-faint">Nothing painted yet: every hand folds.</div>}
          <div className="space-y-2">
            {exports.map((x) => (
              <div key={x.action}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: ACTION_COLORS[x.action] }}>
                    {ACTION_LABELS[x.action]}
                  </span>
                  <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => copy(x.action, x.text)}>
                    {copied === x.action ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <textarea readOnly value={x.text} rows={2} className="w-full resize-y rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink" />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">Paste a range</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="e.g. 22+, A2s+, KTs+, QJs, AJo+, KQo:0.5"
            className="w-full resize-y rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className={`text-xs ${parsed?.error ? 'text-danger' : 'text-faint'}`}>
              {parsed?.error ?? (parsed?.weights ? `${comboTotal(parsed.weights).toFixed(1).replace(/\.0$/, '')} combos` : 'Hands, + and - ranges, single combos, :weight')}
            </span>
            <Button variant="primary" disabled={!parsed?.weights} onClick={paint}>
              Paint with the brush ({brushText(brush)})
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
