import { formatRange } from '../../core/ranges/notation';
import { comboTotal } from '../../core/ranges/range';
import { topPercent } from '../../core/ranges/ranking';

/** Every starting hand. */
export const ANY = '22+, A2+, K2+, Q2+, J2+, T2+, 92+, 82+, 72+, 62+, 52+, 42+, 32';

export interface QuickRange {
  label: string;
  /** Range text; '' empties the range. */
  text: string;
  title: string;
}

function top(label: string, pct: number, minusPct = 0, why = ''): QuickRange {
  const w = topPercent(pct, minusPct);
  const combos = comboTotal(w);
  const text = formatRange(w);
  return { label, text, title: `${why}${text} (${combos} combos, ${((combos / 1326) * 100).toFixed(1)}% of hands)` };
}

/** One click ranges, cut from one hand ranking (core/ranges/ranking.ts). */
export const QUICK_RANGES: readonly QuickRange[] = [
  { label: 'Clear', text: '', title: 'Empty the range, to type a hand or paint a range' },
  { label: 'Any two', text: ANY, title: 'Every starting hand (100%)' },
  { label: 'Pairs', text: '22+', title: 'Every pair: 22+ (78 combos, 5.9% of hands)' },
  top('Top 3%', 3),
  top('Top 5%', 5),
  top('Top 10%', 10),
  top('Top 10% capped', 10, 3, 'The top 10% without the top 3% (QQ+, AK would have re-raised): a calling range. '),
];

/**
 * The quick range buttons. `current` is the range text shown now: the button that gave it is
 * lit (Clear never is: it is an action, not a range).
 */
export function QuickRangeButtons({ current, onPick, className = '' }: { current: string; onPick: (text: string) => void; className?: string }) {
  const now = current.trim();
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {QUICK_RANGES.map((q) => (
        <button
          key={q.label}
          type="button"
          onClick={() => onPick(q.text)}
          title={q.title}
          className={`rounded border px-1.5 py-0.5 text-xs ${
            q.text && q.text === now ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'
          }`}
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}
