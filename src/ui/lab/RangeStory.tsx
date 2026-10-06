import { useState } from 'react';
import { BUCKETS, BUCKET_LABELS, rangeBuckets, type Bucket } from '../../core/buckets';
import type { Card } from '../../core/cards';
import type { Motives } from '../../core/motives/decide';
import type { StoryStep } from '../../core/motives/story';
import { whyBucket } from '../../core/motives/why';
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
  air: '#64748b',
};

export const BUCKET_SHORT: Record<Bucket, string> = {
  cpfs: 'Stacks',
  thick: 'Thick',
  thin: 'Thin',
  sdv: 'SDV',
  'strong-draw': 'Draw+',
  'weak-draw': 'Draw',
  air: 'Air',
};

/** The motives in a few words, as the why line uses them. */
const MOTIVE_SHORT: Record<keyof Motives, string> = {
  gain: 'greed',
  loss: 'loss aversion',
  fear: 'fear of being outdrawn',
  trap: 'trapping',
  tough: 'fear of a tough spot',
  embarrassment: 'embarrassment',
  liking: 'habit',
};

const pct = (x: number) => (Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);
export const combosText = (n: number) => n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, '');

/** "Raise 3.5x over Call: fear of being outdrawn, greed · 16 of 47 turn cards hurt it". */
export function whyLine(s: StoryStep, b: Bucket, numbers = false): string | null {
  const w = whyBucket(s, b);
  if (!w) return null;
  const head = `${s.options[w.winner]!.label} over ${s.options[w.loser]!.label}`;
  const reasons = w.reasons
    .slice(0, numbers ? 3 : 2)
    .map((r) => MOTIVE_SHORT[r.motive] + (numbers ? ` +${r.by.toFixed(2)}` : ''))
    .join(', ');
  const next = s.street === 'flop' ? 'turn' : 'river';
  const cards = s.nextCards > 0 && w.scaryCards > 0 ? ` · ${w.scaryCards} of ${s.nextCards} ${next} cards hurt it` : '';
  return `${head}${reasons ? `: ${reasons}` : ''}${cards}`;
}

/** A range on a board as one bar of HHP buckets, strongest on the left. */
export function BucketBar({ weights, board }: { weights: Weights; board: Card[] }) {
  const { total, rows } = rangeBuckets(board, weights);
  if (!(total > 0)) return null;
  const shares = Object.fromEntries(BUCKETS.map((b) => [b, rows[b].combos / total])) as Record<Bucket, number>;
  return <SharesBar shares={shares} combos={Object.fromEntries(BUCKETS.map((b) => [b, rows[b].combos])) as Record<Bucket, number>} />;
}

/** The same bar from bucket shares (0..1); combos only for the tooltips. */
export function SharesBar({ shares, combos }: { shares: Partial<Record<Bucket, number>>; combos?: Partial<Record<Bucket, number>> }) {
  const of = (b: Bucket) => shares[b] ?? 0;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-sm bg-surface-3">
        {BUCKETS.map((b) =>
          of(b) > 0 ? (
            <div
              key={b}
              title={`${BUCKET_LABELS[b]}: ${combos?.[b] !== undefined ? `${combosText(combos[b]!)} combos (${pct(of(b))})` : pct(of(b))}`}
              style={{ width: `${of(b) * 100}%`, background: BUCKET_COLORS[b] }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] leading-tight text-faint">
        {BUCKETS.filter((b) => of(b) >= 0.005).map((b) => (
          <span key={b} title={BUCKET_LABELS[b]}>
            <span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: BUCKET_COLORS[b] }} />
            {BUCKET_SHORT[b]} {pct(of(b))}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * One player's postflop actions and what each did to their range: combos before → after, the
 * share that can play for stacks (a call that drops it is a cap), and on a click, how much of
 * each bucket took the action and why. `detailed` (the range window) opens every row and shows
 * the motive amounts.
 */
export function RangeStory({
  seat,
  steps,
  step,
  known,
  detailed = false,
}: {
  seat: number;
  steps: readonly StoryStep[];
  step: number;
  known: readonly Card[];
  detailed?: boolean;
}) {
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
        const isOpen = detailed || open === s.event;
        return (
          <div key={s.event} className="rounded border border-line/60 bg-surface-2/60 px-2 py-1">
            <button
              type="button"
              disabled={!!s.skipped || detailed}
              onClick={() => setOpen(isOpen ? null : s.event)}
              className="flex w-full items-baseline gap-2 text-left text-xs"
              title={s.skipped || detailed ? undefined : 'Which hands took this action, and why'}
            >
              <span className="w-9 shrink-0 text-faint">{streetName(s.street)}</span>
              <span className="font-semibold">{s.action}</span>
              {s.skipped ? (
                <span className="text-faint">no range</span>
              ) : (
                <>
                  <span className={capped ? 'font-semibold text-warn' : 'text-faint'} title="Share of the range that can play for stacks, before → after">
                    Stacks {pct(topBefore)} → {pct(topAfter)}
                    {capped && ' · capped'}
                  </span>
                  <span className="ml-auto shrink-0 text-muted tabular-nums" title="Combos before → after">
                    {combosText(before.total)} → {combosText(after.total)}
                  </span>
                </>
              )}
            </button>
            {isOpen && !s.skipped && (
              <div className="mt-1.5 space-y-1.5 border-t border-line/60 pt-1.5">
                <div className="space-y-1">
                  {BUCKETS.filter((b) => (s.byBucket[b]?.combos ?? 0) > 0).map((b) => {
                    const r = s.byBucket[b]!;
                    const why = r.combos >= 1 ? whyLine(s, b, detailed) : null;
                    return (
                      <div key={b} className="text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">
                            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: BUCKET_COLORS[b] }} />
                            {BUCKET_LABELS[b]}
                          </span>
                          <span className="text-faint tabular-nums">{combosText(r.combos)}</span>
                          <span className="w-20 shrink-0">
                            <span className="block h-1.5 rounded-sm bg-surface-3">
                              <span className="block h-1.5 rounded-sm" style={{ width: `${r.took * 100}%`, background: BUCKET_COLORS[b] }} />
                            </span>
                          </span>
                          <span className="w-8 shrink-0 text-right tabular-nums">{pct(r.took)}</span>
                        </div>
                        {why && <div className="pl-2.5 leading-snug text-faint">{why}</div>}
                      </div>
                    );
                  })}
                </div>
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
