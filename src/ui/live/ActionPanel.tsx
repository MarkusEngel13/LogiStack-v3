import { useState } from 'react';
import { legalActions } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import type { Currency, HandEvent, SeatNo } from '../../core/hand/types';
import { actAs, boxStart, boxStep, passUntil, restPass, sizePresets, stillToAct, type Move } from '../../core/live/tap';
import { MoneyInput } from '../controls';
import { playerTypeColor } from '../playerTypes';
import { Key } from './parts';

/**
 * One street's betting: the players still to act, the next one already picked. Tap a later
 * player and everyone before him passes (folds facing a bet, checks when it's free); then his
 * move - fold, check / call, a size chip, the amount box, all-in. "Rest fold" ends the street.
 */
export function ActionPanel({
  state,
  hero,
  nameOf,
  money,
  currency,
  openBB,
  onEvents,
}: {
  state: TableState;
  hero: SeatNo | undefined;
  nameOf: (seat: SeatNo) => string;
  money: (v: number) => string;
  currency: Currency;
  openBB: number;
  onEvents: (events: HandEvent[]) => void;
}) {
  const order = stillToAct(state);
  const [picked, setPicked] = useState<SeatNo | null>(null);
  const seat = picked !== null && order.includes(picked) ? picked : order[0];
  if (seat === undefined) return null;
  const before = passUntil(state, seat);
  const passes = (before?.events ?? []).filter((e): e is Extract<HandEvent, { type: 'action' }> => e.type === 'action');
  const who = (s: SeatNo) => (s === hero ? 'You' : nameOf(s));
  const seatState = (s: SeatNo) => state.seats.find((x) => x.seat === s)!;
  // "UTG, HJ fold · BB checks": what tapping this player says about the ones before him
  const passText = (['fold', 'check'] as const)
    .map((verb) => {
      const list = passes.filter((e) => e.action === verb).map((e) => who(e.seat));
      if (list.length === 0) return '';
      const one = list.length === 1 && list[0] !== 'You';
      return `${list.join(', ')} ${one ? `${verb}s` : verb}`;
    })
    .filter(Boolean)
    .join(' · ');
  const rest = restPass(state);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        {order.map((s) => {
          const x = seatState(s);
          const on = s === seat;
          const skipped = passes.some((e) => e.seat === s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => setPicked(s)}
              className={`min-h-12 min-w-0 rounded-lg border px-1.5 py-1 text-left text-xs leading-tight ${
                on ? 'border-accent bg-accent/20 text-ink ring-1 ring-accent' : skipped ? 'border-line bg-surface text-faint' : 'border-line bg-surface-2 text-muted'
              }`}
              style={{ borderLeft: `4px solid ${s === hero ? 'var(--color-accent)' : (playerTypeColor(x.playerType) ?? 'var(--color-line)')}` }}
            >
              <span className="block text-[10px] text-faint">
                {x.position}
                {x.streetBet > 0 && ` · ${money(x.streetBet)}`}
              </span>
              <span className={`block truncate font-semibold ${skipped ? 'line-through' : ''}`}>{who(s)}</span>
            </button>
          );
        })}
        {rest.length > 1 && (
          <button
            type="button"
            onClick={() => onEvents(rest)}
            className="min-h-12 rounded-lg border border-dashed border-line px-1.5 py-1 text-xs leading-tight text-muted"
            title="Everyone still to act passes"
          >
            {state.currentBet > 0 ? 'Rest fold' : 'Rest check'}
          </button>
        )}
      </div>
      {passText && <p className="text-xs text-faint">{passText}</p>}
      {before && (
        <Moves
          key={`${state.eventsApplied}-${seat}`}
          at={before.state}
          name={who(seat)}
          money={money}
          currency={currency}
          openBB={openBB}
          onMove={(m) => {
            const events = actAs(state, seat, m);
            if (!events) return;
            setPicked(null);
            onEvents(events);
          }}
        />
      )}
    </div>
  );
}

/** What the picked player does, at the state where it's his turn. */
function Moves({ at, name, money, currency, openBB, onMove }: { at: TableState; name: string; money: (v: number) => string; currency: Currency; openBB: number; onMove: (m: Move) => void }) {
  const legal = legalActions(at);
  const [box, setBox] = useState(() => boxStart(at, openBB));
  if (!legal) return null;
  const presets = sizePresets(at);
  const canSize = legal.canBet || legal.canRaise;
  const bbOf = (v: number) => `${Math.round((v / at.rules.bb) * 10) / 10} BB`;
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-2.5">
      <div className="text-sm">
        <span className="font-semibold">{name}</span>
        {legal.toCall > 0 && <span className="text-muted"> · {money(legal.toCall)} to call</span>}
      </div>
      <div className={`grid gap-1.5 ${legal.toCall > 0 && canSize ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {legal.toCall > 0 && (
          <Key tone="danger" onClick={() => onMove('fold')}>
            Fold
          </Key>
        )}
        {legal.canCheck ? (
          <Key onClick={() => onMove('check')}>Check</Key>
        ) : (
          <Key onClick={() => onMove('call')}>Call {money(legal.toCall)}</Key>
        )}
        {canSize && (
          <Key tone="accent" onClick={() => onMove('allin')}>
            All-in {money(legal.maxTo)}
          </Key>
        )}
      </div>
      {presets.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {presets.map((p) => (
            <Key key={p.to} onClick={() => onMove({ to: p.to })}>
              <span className="block font-semibold">{p.label}</span>
              <span className="block text-[11px] text-muted">{p.allIn ? 'all-in' : money(p.to)}</span>
            </Key>
          ))}
        </div>
      )}
      {canSize && (
        <div className="flex items-stretch gap-1.5">
          <button type="button" aria-label="One big blind less" onClick={() => setBox(boxStep(at, box, -1))} className="w-11 shrink-0 rounded-lg border border-line bg-surface-2 text-xl font-bold">
            −
          </button>
          <div className="min-w-0 flex-1">
            <MoneyInput value={box} currency={currency} onChange={setBox} />
          </div>
          <button type="button" aria-label="One big blind more" onClick={() => setBox(boxStep(at, box, 1))} className="w-11 shrink-0 rounded-lg border border-line bg-surface-2 text-xl font-bold">
            +
          </button>
          <button
            type="button"
            disabled={box <= 0}
            onClick={() => onMove({ to: box })}
            className="shrink-0 rounded-lg bg-accent px-3 text-sm leading-tight font-semibold text-accent-ink disabled:opacity-40"
          >
            {legal.canBet ? 'Bet' : 'Raise'}
            <span className="block text-[10px] font-normal">{bbOf(Math.min(Math.max(box, legal.minTo), legal.maxTo))}</span>
          </button>
        </div>
      )}
    </div>
  );
}
