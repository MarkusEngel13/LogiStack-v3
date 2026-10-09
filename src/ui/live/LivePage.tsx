import { useMemo, useState } from 'react';
import { replay } from '../../core/engine/replay';
import type { HandRecord } from '../../core/hand/types';
import { handOver } from '../../core/live/quick';
import { Button } from '../controls';
import { formatAmount } from '../format';
import { deleteHand, saveHand } from '../library';
import { LiveHand } from './LiveHand';
import { LiveSetup } from './LiveSetup';
import { defaultTable, followingHand, handAt, loadLive, saveLive, sessionHands, tableOf, worthKeeping, type LiveTable } from './liveStore';

type Mode = 'setup' | 'hand' | 'edit';

/** Tonight's result so far and the hands left to finish. */
function SessionBar({ hand, onResume }: { hand: HandRecord; onResume: (h: HandRecord) => void }) {
  const list = useMemo(() => sessionHands(hand), [hand]);
  const rows = list.map((h) => {
    try {
      const s = replay(h);
      return { h, done: handOver(s), net: h.hero !== undefined ? (s.result?.net[h.hero] ?? 0) : 0 };
    } catch {
      return { h, done: false, net: 0 };
    }
  });
  const done = rows.filter((r) => r.done);
  const open = rows.filter((r) => !r.done && r.h.id !== hand.id);
  const net = done.reduce((t, r) => t + r.net, 0);
  const money = (v: number) => formatAmount(v, hand.table.currency, hand.table.blinds.bb);
  if (rows.length === 0) return null;
  return (
    <div className="mx-auto max-w-lg space-y-2 px-4 pb-8">
      <div className="flex items-baseline justify-between border-t border-line pt-3 text-sm">
        <span className="text-muted">Tonight: {done.length} {done.length === 1 ? 'hand' : 'hands'} entered</span>
        <span className={`font-semibold tabular-nums ${net > 0 ? 'text-ok' : net < 0 ? 'text-danger' : 'text-muted'}`}>
          {net > 0 ? '+' : net < 0 ? '−' : ''}
          {money(Math.abs(net))}
        </span>
      </div>
      {open.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-faint">To finish:</div>
          {open.map((r) => (
            <button key={r.h.id} type="button" onClick={() => onResume(r.h)} className="block w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-left text-sm">
              #{r.h.handNo} · {r.h.players.find((p) => p.seat === r.h.hero)?.cards?.join(' ') ?? ''} · {r.h.events.length} actions
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The live screen: set up tonight's table once, then enter hand after hand in a few taps.
 * Every hand with your cards or an action in it is saved to Hands as it's entered.
 */
export function LivePage({ onOpenHand }: { onOpenHand: (h: HandRecord) => void }) {
  const saved = useMemo(loadLive, []);
  const [table, setTable] = useState<LiveTable>(saved?.table ?? defaultTable());
  const [hand, setHand] = useState<HandRecord | null>(saved?.hand ?? null);
  const [mode, setMode] = useState<Mode>(saved?.hand ? 'hand' : 'setup');
  /** The newest hand, while an older one is being finished. */
  const [parked, setParked] = useState<HandRecord | null>(null);

  const persist = (t: LiveTable, h: HandRecord | null) => saveLive({ table: t, ...(h ? { hand: parked ?? h } : {}) });

  const change = (h: HandRecord) => {
    setHand(h);
    if (worthKeeping(h)) saveHand(h);
    if (!parked) persist(table, h);
  };

  const next = (keep: boolean) => {
    if (!hand) return;
    if (keep && worthKeeping(hand)) saveHand(hand);
    if (!keep) deleteHand(hand.id);
    if (parked) {
      setHand(parked);
      setParked(null);
      persist(table, parked);
      return;
    }
    const n = followingHand(hand);
    setHand(n);
    persist(table, n);
  };

  if (mode === 'setup' || !hand) {
    return (
      <LiveSetup
        initial={table}
        onDone={(t) => {
          const h = handAt(t);
          setTable(t);
          setHand(h);
          setMode('hand');
          saveLive({ table: t, hand: h });
        }}
        onCancel={hand ? () => setMode('hand') : undefined}
      />
    );
  }

  if (mode === 'edit') {
    return (
      <LiveSetup
        editing
        initial={tableOf(hand, table)}
        onCancel={() => setMode('hand')}
        onDone={(t) => {
          const h = { ...handAt(t, hand.session), id: hand.id, handNo: hand.handNo };
          setTable({ ...table, ...t });
          setHand(h);
          setMode('hand');
          saveLive({ table: { ...table, ...t }, hand: h });
        }}
      />
    );
  }

  return (
    <>
      <LiveHand
        key={hand.id}
        hand={hand}
        openBB={table.openBB}
        onChange={change}
        onNext={next}
        onEditTable={() => setMode('edit')}
        onOpenLab={(h) => {
          saveHand(h);
          onOpenHand(h);
        }}
      />
      {parked && (
        <div className="mx-auto max-w-lg px-4 pb-4">
          <Button variant="ghost" onClick={() => next(true)}>
            ← Back to the current hand
          </Button>
        </div>
      )}
      <SessionBar
        hand={parked ?? hand}
        onResume={(h) => {
          if (!parked) setParked(hand);
          setHand(h);
        }}
      />
      <div className="mx-auto max-w-lg px-4 pb-10">
        <Button variant="ghost" onClick={() => setMode('setup')}>
          New table / new night
        </Button>
      </div>
    </>
  );
}
