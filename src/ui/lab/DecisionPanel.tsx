import { useMemo, useState } from 'react';
import { legalActions, potOdds, potTotal } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import type { HandRecord, SeatNo } from '../../core/hand/types';
import { playerRange } from '../../core/ranges/handRanges';
import { comboTotal, withoutCards } from '../../core/ranges/range';
import type { ChartChoice } from '../../core/ranges/spot';
import { PlayingCard } from '../cards/PlayingCard';
import type { Money } from '../replay/views';
import { useEquity } from './useEquity';
import { VillainRangeModal } from './VillainRangeModal';

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const combosText = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')} combos`;

/**
 * The player to act against the ranges of everyone still in: equity, the pot odds they need,
 * call or fold, and what calling is worth. In the Lab each range can be repainted (god mode).
 */
export function DecisionPanel({
  hand,
  state,
  step,
  editable,
  money,
  charts,
  onSetRange,
}: {
  hand: HandRecord;
  state: TableState;
  step: number;
  editable: boolean;
  money: Money;
  charts: readonly ChartChoice[];
  /** A range text for this player from this step on, or null to go back to the chart. */
  onSetRange: (seat: SeatNo, range: string | null) => void;
}) {
  const [editing, setEditing] = useState<SeatNo | null>(null);
  const me = state.phase === 'betting' && state.toAct !== null ? state.seats.find((s) => s.seat === state.toAct) : undefined;
  // Opponents are the players who have put chips in by choice; those still to act (who mostly
  // fold) are left out rather than counted as random hands.
  const acted = new Set(state.log.flatMap((e) => (e.kind === 'action' && e.action !== 'fold' ? [e.seat] : [])));
  const live = me ? state.seats.filter((s) => s.dealtIn && !s.folded && s.seat !== me.seat) : [];
  const opponents = live.filter((s) => acted.has(s.seat));
  const waiting = live.filter((s) => !acted.has(s.seat));

  // opponents come from state, so these four cover it
  const ranges = useMemo(() => opponents.map((o) => playerRange(hand, state, step, o.seat, charts)), [hand, state, step, charts]);
  const dead = me?.cards ? [...me.cards, ...state.board] : [...state.board];
  const question =
    me?.cards && ranges.length > 0 ? { kind: 'hero' as const, hero: me.cards, board: state.board, villains: ranges.map((r) => r.weights) } : null;
  const key = JSON.stringify([me?.cards, state.board, ranges.map((r) => r.note?.range ?? `${r.auto.chart?.id}:${r.auto.spot.took}`)]);
  const { answer, pending } = useEquity(question, key);

  if (!me) return null;

  const legal = legalActions(state);
  const odds = potOdds(state);
  const toCall = legal?.toCall ?? 0;
  const equity = answer?.equity;
  const ev = equity !== undefined && odds ? equity * (odds.pot + toCall) - toCall : undefined;
  const needed = odds ? odds.percent / 100 : 0;

  const verdict =
    equity === undefined || Number.isNaN(equity)
      ? null
      : toCall === 0
        ? { text: 'No bet to call', tone: 'var(--surface-3)', fg: 'var(--text)' }
        : ev! > 0
          ? { text: `Call · EV +${money(Math.round(ev!))}`, tone: '#1f8a4c', fg: '#fff' }
          : { text: `Fold · calling loses ${money(Math.round(-ev!))}`, tone: '#c62828', fg: '#fff' };

  const editedRange = editing !== null ? ranges.find((r) => r.seat === editing) : undefined;
  const editedSeat = editing !== null ? state.seats.find((s) => s.seat === editing) : undefined;

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-xs font-bold tracking-wider text-muted uppercase">Decision</span>
        <span className="flex items-center gap-2 text-sm">
          {me.name}
          <span className="text-muted">{me.position}</span>
          {me.cards && (
            <span className="flex gap-0.5">
              {me.cards.map((c) => (
                <PlayingCard key={c} card={c} width="20px" mini />
              ))}
            </span>
          )}
        </span>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        {!me.cards ? (
          <p className="text-sm text-muted">{editable ? `Click ${me.name}'s seat to set the hole cards and see the equity.` : `${me.name}'s cards are unknown.`}</p>
        ) : ranges.length === 0 ? (
          <p className="text-sm text-muted">Nobody has put chips in yet, so there is no range to play against.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted">Equity</span>
              <span className="text-2xl font-bold tabular-nums">
                {pending && !answer ? '…' : equity !== undefined && !Number.isNaN(equity) ? pct(equity) : '–'}
                {answer?.stdError !== undefined && <span className="ml-1 text-xs font-normal text-muted">±{pct(2 * answer.stdError)}</span>}
              </span>
            </div>
            {toCall > 0 && odds && (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted">
                  To call {money(toCall)} into {money(odds.pot)}
                </span>
                <span className="tabular-nums">needs {pct(needed)}</span>
              </div>
            )}
            {verdict && (
              <div className="rounded-md px-3 py-1.5 text-center text-sm font-bold" style={{ background: verdict.tone, color: verdict.fg }}>
                {verdict.text}
              </div>
            )}
            {answer?.error && <p className="text-xs text-danger">{answer.error}</p>}
            <p className="text-xs text-faint">
              {answer?.method === 'monte-carlo'
                ? 'Simulated (60,000 deals, several opponents). '
                : answer?.method
                  ? 'Exact. '
                  : ''}
              {toCall > 0 ? 'EV assumes the hand is checked down from here.' : `Pot ${money(potTotal(state))}. Bet and raise EV come next.`}
            </p>
          </>
        )}
      </div>

      <div className="space-y-2 border-t border-line px-4 py-3">
        {ranges.map((r) => {
          const o = state.seats.find((s) => s.seat === r.seat)!;
          const live = comboTotal(withoutCards(r.weights, dead));
          return (
            <div key={r.seat} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{o.name}</span>
                <span className="text-xs text-muted">{o.position}</span>
                <span className="ml-auto text-xs text-muted">{combosText(live)}</span>
                {editable && (
                  <button type="button" onClick={() => setEditing(r.seat)} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:text-ink">
                    Edit
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-snug text-faint">
                {r.note ? (
                  <span className="text-accent-strong">Your range{r.note.fromEvent < step ? ' (set earlier in the hand)' : ''}.</span>
                ) : (
                  r.explanation
                )}
              </p>
            </div>
          );
        })}
        {waiting.length > 0 && (
          <p className="text-xs leading-snug text-faint">
            Still to act, left out: {waiting.map((s) => s.name).join(', ')}.
          </p>
        )}
        {state.street !== 'preflop' && ranges.some((r) => !r.note) && (
          <p className="border-t border-line pt-2 text-xs leading-snug text-faint">
            These are preflop ranges: bets after the flop don't narrow them yet.{editable ? ' Use Edit to narrow one by hand.' : ''}
          </p>
        )}
      </div>

      {editedRange && editedSeat && (
        <VillainRangeModal
          title={`${editedSeat.name} (${editedSeat.position}): range at this point`}
          initial={editedRange.weights}
          dead={dead}
          charts={charts}
          canReset={editedRange.note?.fromEvent === step}
          onSave={(text) => {
            onSetRange(editedSeat.seat, text);
            setEditing(null);
          }}
          onReset={() => {
            onSetRange(editedSeat.seat, null);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
