import { BUCKETS, BUCKET_LABELS } from '../../core/buckets';
import { sizeKey, type PlayerAnswer, type SizeQuestion, type SizeRow } from '../../core/motives/sizes';
import { Button } from '../controls';
import type { Money } from '../replay/views';
import { BUCKET_COLORS, BucketBar, combosText } from './RangeStory';
import { useEquity } from './useEquity';

const pct = (x: number) => (Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);

/** Each player's own answer, for a tooltip: "Dan folds 40%, calls 55%, raises 5%". */
function perPlayer(row: SizeRow, names: Record<number, string>): string {
  const check = row.kind === 'check';
  return row.players
    .map((p: PlayerAnswer) =>
      check
        ? `${names[p.seat] ?? 'Player'}: checks behind ${pct(p.call)}, bets ${pct(p.raise)}`
        : `${names[p.seat] ?? 'Player'}: folds ${pct(p.fold)}, calls ${pct(p.call)}, raises ${pct(p.raise)}`,
    )
    .join('\n');
}

/** The button text for playing a row in the Lab. */
export const playLabel = (r: SizeRow) =>
  r.allIn && r.kind !== 'call' ? 'All-in' : ({ fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise' } as const)[r.kind];

/**
 * Every option for the player to act against everyone still in: who folds, calls or raises
 * (each player bucket by bucket: elastic or inelastic), what the size says about your own range,
 * and with known cards the EV of each, this street. `onUse` enters the option in the Lab.
 */
export function SizeExplorer({
  q,
  money,
  names,
  onUse,
}: {
  q: SizeQuestion;
  money: Money;
  /** Seat → name, for everyone in `q.others`. */
  names: Record<number, string>;
  onUse?: (row: SizeRow) => void;
}) {
  const { answer, pending } = useEquity({ kind: 'sizes', q }, `sizes:${sizeKey(q)}`);
  const a = answer?.sizes;
  const evs = a ? [...a.passive, ...a.rows].map((r) => r.ev).filter((x): x is number => x !== undefined) : [];
  const best = evs.length ? Math.max(...evs) : undefined;
  const isBest = (ev: number | undefined) => ev !== undefined && best !== undefined && Math.abs(ev - best) < 0.5;
  const evText = (ev: number | undefined) => (ev === undefined ? '–' : `${ev >= 0 ? '+' : '−'}${money(Math.round(Math.abs(ev)))}`);
  const multi = q.others.length > 1;
  const who = q.others.map((o) => names[o.seat] ?? 'Player').join(', ');
  const players = a?.rows[0]?.players ?? [];

  const optionRow = (r: SizeRow) => {
    const passive = r.kind === 'fold' || r.kind === 'check' || r.kind === 'call';
    const answered = r.players.length > 0;
    return (
      <tr key={`${r.kind}-${r.label}`} className={`border-t border-line ${isBest(r.ev) ? 'bg-surface-2' : ''}`}>
        <td className="py-1.5">
          {r.label} {r.amount > 0 && <span className="text-xs text-muted">{money(r.amount)}</span>}
        </td>
        {!answered ? (
          <td colSpan={3} className="py-1.5 text-right text-xs text-faint">
            {r.kind === 'check' ? 'checked down' : r.kind === 'call' ? 'checked down after' : ''}
          </td>
        ) : r.kind === 'check' ? (
          <>
            <td className="py-1.5 text-right text-faint">–</td>
            <td className="py-1.5 text-right tabular-nums" title={perPlayer(r, names)}>
              {pct(r.call)} <span className="text-xs text-muted">check</span>
            </td>
            <td className="py-1.5 text-right tabular-nums" title={perPlayer(r, names)}>
              {pct(r.raise)} <span className="text-xs text-muted">bet</span>
            </td>
          </>
        ) : (
          <>
            <td className="py-1.5 text-right tabular-nums" title={perPlayer(r, names)}>
              {pct(r.fold)}
            </td>
            <td className="py-1.5 text-right tabular-nums" title={perPlayer(r, names)}>
              {pct(r.call)}
            </td>
            <td className="py-1.5 text-right tabular-nums" title={perPlayer(r, names)}>
              {pct(r.raise)}
            </td>
          </>
        )}
        <td className={`py-1.5 text-right tabular-nums ${isBest(r.ev) ? 'font-bold text-ok' : ''}`}>{evText(r.ev)}</td>
        <td className="w-[34%] py-1.5 pl-4">{!passive || r.kind === 'call' ? <BucketBar weights={r.shows} board={q.situation.board} /> : null}</td>
        {onUse && (
          <td className="py-1.5 pl-2 text-right">
            <Button variant="secondary" onClick={() => onUse(r)}>
              {playLabel(r)}
            </Button>
          </td>
        )}
      </tr>
    );
  };

  return (
    <div>
      {pending && !a && (
        <p className="text-sm text-muted">
          Working out every option{multi ? ` against ${q.others.length} players (on the flop this takes several seconds)` : ' (a few seconds)'}…
        </p>
      )}
      {answer?.error && <p className="text-sm text-danger">{answer.error}</p>}
      {a && (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Pot {money(q.situation.pot + q.situation.toCall)}
            {q.situation.toCall > 0 && ` · to call ${money(q.situation.toCall)}`}
            {a.equity !== undefined && (
              <>
                {' '}
                · your equity against {multi ? `${who} (all of them)` : `${who}'s range`}{' '}
                <span className="font-semibold text-ink">{pct(a.equity)}</span>
              </>
            )}
          </p>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-semibold">Option</th>
                <th className="py-1 text-right font-semibold" title={multi ? 'Everyone folds' : undefined}>
                  {multi ? 'All fold' : 'Folds'}
                </th>
                <th className="py-1 text-right font-semibold" title={multi ? 'Nobody raises and someone calls' : undefined}>
                  {multi ? 'Called' : 'Calls'}
                </th>
                <th className="py-1 text-right font-semibold" title={multi ? 'Someone raises' : undefined}>
                  {multi ? 'Raised' : 'Raises'}
                </th>
                <th
                  className="py-1 text-right font-semibold"
                  title="Chips won from here on, this street only: checked down after the street; a bet gets their answers (against a raise the better of fold and call), a check gets theirs (check behind or bet, then fold or call)"
                >
                  EV
                </th>
                <th className="py-1 pl-4 font-semibold">What it says about your range</th>
                {onUse && <th />}
              </tr>
            </thead>
            <tbody>
              {a.passive.map(optionRow)}
              {a.rows.map(optionRow)}
            </tbody>
          </table>

          {players.map((p, i) => (
            <div key={p.seat}>
              <div className="mb-1.5 text-xs font-bold tracking-wider text-muted uppercase">
                Who keeps going against each size ({names[p.seat] ?? 'Player'}, by bucket)
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
                  {BUCKETS.filter((b) => (p.byBucket[b]?.combos ?? 0) >= 0.5).map((b) => (
                    <tr key={b} className="border-t border-line">
                      <td className="py-1">
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: BUCKET_COLORS[b] }} />
                        {BUCKET_LABELS[b]}
                      </td>
                      <td className="py-1 text-right text-faint tabular-nums">{combosText(p.byBucket[b]!.combos)}</td>
                      {a.rows.map((r) => {
                        const x = r.players[i]?.byBucket[b];
                        const v = x?.cont ?? NaN;
                        return (
                          <td key={r.label} className="px-0.5 py-0.5">
                            <div
                              className="rounded px-1 py-0.5 text-center tabular-nums"
                              style={{ background: `rgba(31, 138, 76, ${Number.isNaN(v) ? 0 : (0.15 + 0.75 * v).toFixed(2)})`, color: v > 0.5 ? '#fff' : 'var(--text)' }}
                              title={x ? `continues ${pct(x.cont)}, raises ${pct(x.raise)}` : ''}
                            >
                              {pct(v)}
                              {/* ▲, not ↑: at this size the arrow reads as a 1 ("↑83%" looked like 183%) */}
                              {x && x.raise >= 0.05 && <span className="ml-1 text-[10px] opacity-80">▲{pct(x.raise)}</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="text-[11px] leading-snug text-faint">
            Green = the share of the bucket that calls or raises (▲ = raises). Inelastic buckets stay green whatever the size; elastic
            ones fade as it grows. The inverse question: pick the size the hands you want to pay you still call (value), or the
            hands you want to fold do fold (bluff). EV is this street only, every option the same way: checked down once the street is
            over; no later streets, so trap value and implied odds don't show. Everyone decides by the fear-and-greed model with
            their type and status.
            {multi &&
              ' Multiway the players answer in turn: each one counts a player who answered before him as far as that player called; the first raise ends the round (you against the raiser).'}
          </p>
        </div>
      )}
    </div>
  );
}
