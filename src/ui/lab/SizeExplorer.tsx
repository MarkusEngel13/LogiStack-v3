import { BUCKETS, BUCKET_LABELS } from '../../core/buckets';
import type { SizeQuestion, SizeRow } from '../../core/motives/sizes';
import { fingerprint } from '../../core/motives/story';
import { Button, Modal } from '../controls';
import type { Money } from '../replay/views';
import { BUCKET_COLORS, BucketBar, combosText } from './RangeStory';
import { useEquity } from './useEquity';

const pct = (x: number) => (Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);

/**
 * Every bet or raise size for the player to act, against the other player's range: who folds,
 * calls or raises (bucket by bucket: elastic or inelastic), what the size says about your own
 * range, and with known cards the EV of each. `onUse` enters the size in the Lab.
 */
export function SizeExplorer({
  title,
  q,
  money,
  otherName,
  onUse,
  onClose,
}: {
  title: string;
  q: SizeQuestion;
  money: Money;
  otherName: string;
  onUse?: (row: SizeRow) => void;
  onClose: () => void;
}) {
  const key = JSON.stringify([
    q.situation,
    q.actor.profile.name,
    q.other.profile,
    fingerprint(q.actor.range),
    fingerprint(q.other.range),
    q.actor.seen && fingerprint(q.actor.seen),
    q.other.seen && fingerprint(q.other.seen),
    q.actor.cards,
  ]);
  const { answer, pending } = useEquity({ kind: 'sizes', q }, `sizes:${key}`);
  const a = answer?.sizes;
  const evs = a ? [...a.passive.map((p) => p.ev), ...a.rows.map((r) => r.ev)].filter((x): x is number => x !== undefined) : [];
  const best = evs.length ? Math.max(...evs) : undefined;
  const isBest = (ev: number | undefined) => ev !== undefined && best !== undefined && Math.abs(ev - best) < 0.5;
  const evText = (ev: number | undefined) => (ev === undefined ? '–' : `${ev >= 0 ? '+' : '−'}${money(Math.round(Math.abs(ev)))}`);
  const buckets = a?.rows[0] ? BUCKETS.filter((b) => (a.rows[0]!.byBucket[b]?.combos ?? 0) >= 0.5) : [];

  return (
    <Modal title={title} wide="xl" onClose={onClose}>
      {pending && !a && <p className="text-sm text-muted">Working out every size (a few seconds)…</p>}
      {answer?.error && <p className="text-sm text-danger">{answer.error}</p>}
      {a && (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Pot {money(q.situation.pot)}
            {q.situation.toCall > 0 && ` · to call ${money(q.situation.toCall)}`}
            {a.equity !== undefined && (
              <>
                {' '}
                · your equity against {otherName}'s range <span className="font-semibold text-ink">{pct(a.equity)}</span>
              </>
            )}
          </p>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-semibold">Option</th>
                <th className="py-1 text-right font-semibold">Folds</th>
                <th className="py-1 text-right font-semibold">Calls</th>
                <th className="py-1 text-right font-semibold">Raises</th>
                <th className="py-1 text-right font-semibold" title="Chips won from here on, one street: checked down after a call; against a raise the better of fold and call">
                  EV
                </th>
                <th className="py-1 pl-4 font-semibold">What the size says about your range</th>
                {onUse && <th />}
              </tr>
            </thead>
            <tbody>
              {a.passive.map((p) => (
                <tr key={p.label} className="border-t border-line">
                  <td className="py-1.5">{p.label}</td>
                  <td colSpan={3} className="py-1.5 text-right text-xs text-faint">
                    {p.label === 'Check' ? 'checked down' : p.label === 'Call' ? 'checked down after' : ''}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${isBest(p.ev) ? 'font-bold text-ok' : ''}`}>{evText(p.ev)}</td>
                  <td />
                  {onUse && <td />}
                </tr>
              ))}
              {a.rows.map((r) => (
                <tr key={r.label} className={`border-t border-line ${isBest(r.ev) ? 'bg-surface-2' : ''}`}>
                  <td className="py-1.5">
                    {r.label} <span className="text-xs text-muted">{money(r.amount)}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{pct(r.fold)}</td>
                  <td className="py-1.5 text-right tabular-nums">{pct(r.call)}</td>
                  <td className="py-1.5 text-right tabular-nums">{pct(r.raise)}</td>
                  <td className={`py-1.5 text-right tabular-nums ${isBest(r.ev) ? 'font-bold text-ok' : ''}`}>{evText(r.ev)}</td>
                  <td className="w-[38%] py-1.5 pl-4">
                    <BucketBar weights={r.shows} board={q.situation.board} />
                  </td>
                  {onUse && (
                    <td className="py-1.5 pl-2 text-right">
                      <Button variant="secondary" onClick={() => onUse(r)}>
                        {r.allIn ? 'All-in' : r.kind === 'bet' ? 'Bet' : 'Raise'}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div>
            <div className="mb-1.5 text-xs font-bold tracking-wider text-muted uppercase">
              Who keeps going against each size ({otherName}, by bucket)
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 text-left font-semibold">Bucket</th>
                  <th className="py-1 text-right font-semibold">Combos</th>
                  {a.rows.map((r) => (
                    <th key={r.label} className="py-1 text-center font-semibold">
                      {r.label.replace(/^(Bet|Raise) /, '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b} className="border-t border-line">
                    <td className="py-1">
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: BUCKET_COLORS[b] }} />
                      {BUCKET_LABELS[b]}
                    </td>
                    <td className="py-1 text-right text-faint tabular-nums">{combosText(a.rows[0]!.byBucket[b]!.combos)}</td>
                    {a.rows.map((r) => {
                      const x = r.byBucket[b];
                      const v = x?.cont ?? NaN;
                      return (
                        <td key={r.label} className="px-0.5 py-0.5">
                          <div
                            className="rounded px-1 py-0.5 text-center tabular-nums"
                            style={{ background: `rgba(31, 138, 76, ${Number.isNaN(v) ? 0 : (0.15 + 0.75 * v).toFixed(2)})`, color: v > 0.5 ? '#fff' : 'var(--text)' }}
                            title={x ? `continues ${pct(x.cont)}, raises ${pct(x.raise)}` : ''}
                          >
                            {pct(v)}
                            {x && x.raise >= 0.05 && <span className="ml-0.5 text-[10px] opacity-80">↑{pct(x.raise)}</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] leading-snug text-faint">
              Green = the share of the bucket that calls or raises (↑ = raises). Inelastic buckets stay green whatever the size; elastic
              ones fade as it grows. The inverse question: pick the size the hands you want to pay you still call (value), or the
              hands you want to fold do fold (bluff). EV is one street (checked down after a call); both players decide by the
              fear-and-greed model with their type and status.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
