import { useState } from 'react';
import { sizeKey, type SizeQuestion, type SizeRow } from '../../core/motives/sizes';
import type { Money } from '../replay/views';
import { playLabel } from './SizeExplorer';
import { stabilityLine } from '../../core/motives/stability';
import { useEquity } from './useEquity';

const pct = (x: number) => (Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);

/** What the others do against an option, in a line: "folds 40% · calls 55% · raises 5%". */
function answerText(r: SizeRow, names: Record<number, string>, multi: boolean): string {
  if (r.players.length === 0) return r.kind === 'fold' ? 'Fold: nothing more in, nothing won' : 'Checked down from here';
  const all =
    r.kind === 'check'
      ? `${multi ? 'Everyone checks behind' : 'Checks behind'} ${pct(r.call)} · ${multi ? 'someone bets' : 'bets'} ${pct(r.raise)}`
      : multi
        ? `All fold ${pct(r.fold)} · called ${pct(r.call)} · raised ${pct(r.raise)}`
        : `Folds ${pct(r.fold)} · calls ${pct(r.call)} · raises ${pct(r.raise)}`;
  if (!multi) return all;
  const each = r.players.map((p) =>
    r.kind === 'check'
      ? `${names[p.seat] ?? 'Player'}: checks ${pct(p.call)}, bets ${pct(p.raise)}`
      : `${names[p.seat] ?? 'Player'}: folds ${pct(p.fold)}, calls ${pct(p.call)}, raises ${pct(p.raise)}`,
  );
  return [all, ...each].join('\n');
}

/**
 * The EV of every option of the player to act, this street (core/motives/sizes.ts): check and
 * the bet sizes, or fold, call and the raises - all measured the same way, the best one marked,
 * each one playable. `auto` = work it out right away (else on a click: multiway flops take seconds).
 */
export function EvTable({
  q,
  money,
  names,
  auto,
  onUse,
}: {
  q: SizeQuestion;
  money: Money;
  names: Record<number, string>;
  auto: boolean;
  onUse?: (row: SizeRow) => void;
}) {
  const key = sizeKey(q);
  const [asked, setAsked] = useState<string | null>(null);
  const wanted = auto || asked === key;
  const { answer } = useEquity(wanted ? { kind: 'sizes', q } : null, wanted ? `sizes:${key}` : '');
  const a = answer?.sizes;
  const multi = q.others.length > 1;

  if (!wanted) {
    return (
      <button
        type="button"
        onClick={() => setAsked(key)}
        className="w-full rounded-md border border-line px-2 py-1.5 text-sm text-muted hover:border-accent hover:text-ink"
        title="Check or bet, fold, call or raise: the EV of each this street, against everyone still in"
      >
        EV of each option… <span className="text-xs text-faint">({q.others.length} players on the flop: some seconds)</span>
      </button>
    );
  }
  if (!a) return <p className="text-xs text-muted">{answer?.error ? <span className="text-danger">{answer.error}</span> : 'Working out the EV of each option…'}</p>;

  const rows = [...a.passive, ...a.rows].filter((r) => r.ev !== undefined);
  const best = rows.length ? rows.reduce((x, r) => (r.ev! > x.ev! ? r : x)) : undefined;
  const evText = (ev: number) => `${ev >= 0 ? '+' : '−'}${money(Math.round(Math.abs(ev)))}`;
  const preflop = q.situation.board.length === 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-xs font-bold tracking-wider text-muted uppercase"
          title="Your cards against their ranges as the model reads them now, with how often each folds, calls or raises"
        >
          EV this street <span className="font-normal tracking-normal normal-case">(checked down after{preflop ? ' · no implied odds' : ''})</span>
        </span>
        {best && <span className="truncate text-xs font-semibold text-ok">best: {best.label}</span>}
      </div>
      <ul className="mt-1 space-y-0.5 text-sm">
        {rows.map((r) => {
          const top = best !== undefined && Math.abs(r.ev! - best.ev!) < 0.5;
          return (
            <li
              key={`${r.kind}-${r.label}`}
              className={`group flex items-center gap-2 rounded px-2 py-0.5 ${top ? 'bg-ok/15 font-semibold' : ''}`}
              title={answerText(r, names, multi)}
            >
              <span className="min-w-0 flex-1 truncate">
                {r.label}
                {r.amount > 0 && r.kind !== 'call' && <span className="ml-1 text-xs font-normal text-muted">{money(r.amount)}</span>}
              </span>
              <span className={`tabular-nums ${top ? 'text-ok' : ''}`}>{evText(r.ev!)}</span>
              {onUse && (
                <button
                  type="button"
                  onClick={() => onUse(r)}
                  className="rounded px-1.5 text-xs font-normal text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-3 hover:text-ink focus:opacity-100"
                  title={`Play it: ${r.label}`}
                >
                  {playLabel(r)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {best && <StabilityCheck q={q} names={names} money={money} />}
      <p className="mt-1 text-[11px] leading-snug text-faint">
        Your cards against their ranges as the model reads them now. This street only, every option the same way: checked
        down once the street is over. No later streets, so trap value and implied odds don't show
        {preflop ? ' - small pairs and suited connectors look worse than they are, dominated hands better' : ''}.
        {multi ? ' Multiway the others answer in turn.' : ''} Point at a line for how they answer.
      </p>
    </div>
  );
}

/**
 * "Stable?": the best option asked again with each read of the others nudged (their range a
 * little wider or narrower, calling, raising, respecting big bets and bluffing a bit more or
 * less). A line that flips on a small nudge is not a safe exploit. On a click: it takes seconds.
 */
function StabilityCheck({ q, names, money }: { q: SizeQuestion; names: Record<number, string>; money: Money }) {
  const key = sizeKey(q);
  const [asked, setAsked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wanted = asked === key;
  // the key changes when it's asked for: useEquity starts work when its key changes
  const { answer } = useEquity(wanted ? { kind: 'stability', q, names } : null, wanted ? `stability:${key}` : '');
  const n = q.others.length * 10;

  if (!wanted) {
    return (
      <button
        type="button"
        onClick={() => setAsked(key)}
        className="mt-1.5 w-full rounded-md border border-dashed border-line px-2 py-1 text-left text-xs text-muted hover:border-accent hover:text-ink"
        title="Asks the same question again with each read of the others nudged a little: does the best option stay best? A line that flips on a small change is not a safe exploit."
      >
        Stable? Test the best option against {n} small changes of the reads…
      </button>
    );
  }
  if (!answer) return <p className="mt-1.5 text-xs text-muted">Testing against {n} nudges of the reads… (some seconds{q.others.length > 1 ? ', longer multiway' : ''})</p>;
  if (answer.error) return <p className="mt-1.5 text-xs text-danger">{answer.error}</p>;
  const s = answer.stability;
  if (!s) return null;
  const line = stabilityLine(s);
  const tone = { stable: 'border-ok/50 bg-ok/10 text-ok', shaky: 'border-warn/50 bg-warn/10 text-warn', fragile: 'border-danger/50 bg-danger/10 text-danger' }[line.tone];
  const icon = { stable: '✓', shaky: '≈', fragile: '⚠' }[line.tone];
  return (
    <div className={`mt-1.5 rounded-md border px-2 py-1.5 text-xs ${tone}`}>
      <button type="button" className="w-full text-left" onClick={() => setOpen((o) => !o)}>
        <b>{icon}</b> {line.text}
        {s.flips.length > 0 && <span className="ml-1 underline">{open ? 'less' : 'details'}</span>}
      </button>
      {line.detail && <div className="mt-0.5 text-ink/80">{line.detail}</div>}
      {open && s.flips.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-ink">
          {s.flips.map((f) => (
            <li key={f.nudge}>
              If {f.nudge}: <b>{f.best}</b>
              {f.sameAction && <span className="text-muted"> (same action, other size)</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-0.5 text-[10px] text-muted">
        Lead over the next option: {Number.isFinite(s.margin) ? money(Math.round(s.margin)) : '–'}
        {Number.isFinite(s.margin) && s.margin < q.situation.bb ? ' (less than a big blind: those two are as good as each other)' : ''}. Each nudge: his range ±10 %, or one habit about 15 % up or down; your read of him stays.
      </div>
    </div>
  );
}
