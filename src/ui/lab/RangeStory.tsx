import { useState } from 'react';
import { BUCKETS, BUCKET_LABELS, rangeBuckets, type Bucket } from '../../core/buckets';
import type { Card } from '../../core/cards';
import type { StoryStep } from '../../core/motives/story';
import { withoutCards, type Weights } from '../../core/ranges/range';
import { streetName } from '../replay/views';

/** Strongest (dark red) to weakest (grey); draws blue. */
export const BUCKET_COLORS: Record<Bucket, string> = {
  cpfs: '#8e1b1b',
  thick: '#d0452f',
  thin: '#ec8a3a',
  sdv: '#c9a227',
  'strong-draw': '#2f6fd6',
  'weak-draw': '#86a9e0',
  air: '#6b6b6b',
};

const SHORT: Record<Bucket, string> = {
  cpfs: 'Stacks',
  thick: 'Thick',
  thin: 'Thin',
  sdv: 'SDV',
  'strong-draw': 'Draw+',
  'weak-draw': 'Draw',
  air: 'Air',
};

const pct = (x: number) => (Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);
const combos = (n: number) => n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, '');

/** A range on a board as one bar of HHP buckets, strongest on the left. */
export function BucketBar({ weights, board }: { weights: Weights; board: Card[] }) {
  const { total, rows } = rangeBuckets(board, weights);
  if (!(total > 0)) return null;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-sm bg-surface-3">
        {BUCKETS.map((b) =>
          rows[b].combos > 0 ? (
            <div
              key={b}
              title={`${BUCKET_LABELS[b]}: ${combos(rows[b].combos)} combos (${pct(rows[b].combos / total)})`}
              style={{ width: `${(rows[b].combos / total) * 100}%`, background: BUCKET_COLORS[b] }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] leading-tight text-faint">
        {BUCKETS.filter((b) => rows[b].combos / total >= 0.005).map((b) => (
          <span key={b} title={BUCKET_LABELS[b]}>
            <span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: BUCKET_COLORS[b] }} />
            {SHORT[b]} {pct(rows[b].combos / total)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * One player's postflop actions and what each did to their range: combos before → after, the
 * share that can play for stacks (a call that drops it is a cap), and on a click, how often
 * each bucket took that action.
 */
export function RangeStory({ seat, steps, step, known }: { seat: number; steps: readonly StoryStep[]; step: number; known: readonly Card[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const rows = steps.filter((s) => s.seat === seat && s.event < step);
  if (rows.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {rows.map((s) => {
        const dead = [...known, ...s.board];
        const before = rangeBuckets(s.board, withoutCards(s.before, dead));
        const after = rangeBuckets(s.board, withoutCards(s.after, dead));
        const topBefore = before.total > 0 ? before.rows.cpfs.combos / before.total : NaN;
        const topAfter = after.total > 0 ? after.rows.cpfs.combos / after.total : NaN;
        const capped = topBefore >= 0.03 && topAfter < topBefore / 2;
        const isOpen = open === s.event;
        return (
          <div key={s.event} className="rounded border border-line/60 bg-surface-2/60 px-2 py-1">
            <button
              type="button"
              disabled={!!s.skipped}
              onClick={() => setOpen(isOpen ? null : s.event)}
              className="flex w-full items-baseline gap-2 text-left text-xs"
              title={s.skipped ? undefined : 'How often each bucket took this action'}
            >
              <span className="w-9 shrink-0 text-faint">{streetName(s.street)}</span>
              <span className="font-semibold">{s.action}</span>
              {s.skipped ? (
                <span className="text-faint">{s.skipped === 'multiway' ? 'multiway: not narrowed' : 'no range'}</span>
              ) : (
                <>
                  <span className={capped ? 'font-semibold text-warn' : 'text-faint'} title="Share of the range that can play for stacks, before → after">
                    Stacks {pct(topBefore)} → {pct(topAfter)}
                    {capped && ' · capped'}
                  </span>
                  <span className="ml-auto shrink-0 text-muted tabular-nums" title="Combos before → after">
                    {combos(before.total)} → {combos(after.total)}
                  </span>
                </>
              )}
            </button>
            {isOpen && !s.skipped && (
              <div className="mt-1.5 space-y-1.5 border-t border-line/60 pt-1.5">
                <table className="w-full text-[11px]">
                  <tbody>
                    {BUCKETS.filter((b) => (s.byBucket[b]?.combos ?? 0) > 0).map((b) => {
                      const r = s.byBucket[b]!;
                      return (
                        <tr key={b}>
                          <td className="py-0.5">
                            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: BUCKET_COLORS[b] }} />
                            {BUCKET_LABELS[b]}
                          </td>
                          <td className="py-0.5 text-right text-faint tabular-nums">{combos(r.combos)}</td>
                          <td className="w-24 py-0.5 pl-2">
                            <div className="h-1.5 rounded-sm bg-surface-3">
                              <div className="h-1.5 rounded-sm" style={{ width: `${r.took * 100}%`, background: BUCKET_COLORS[b] }} />
                            </div>
                          </td>
                          <td className="w-9 py-0.5 text-right tabular-nums">{pct(r.took)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11px] leading-snug text-faint">
                  The whole range here: {s.options.map((o) => `${o.label} ${pct(o.share)}`).join(' · ')}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
