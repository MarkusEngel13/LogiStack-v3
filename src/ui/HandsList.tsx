import { useMemo, useState } from 'react';
import { sessions, type Session } from '../core/hand/sessions';
import { FIXTURES } from '../core/fixtures';
import type { HandRecord } from '../core/hand/types';
import { Button, Section } from './controls';
import { formatAmount } from './format';
import { deleteFishy, loadFishy } from './fishy';
import { deleteHand, downloadJson, loadHands } from './library';

function describe(h: HandRecord) {
  const money = (v: number) => formatAmount(v, h.table.currency, h.table.blinds.bb);
  const dealt = h.players.filter((p) => !p.sittingOut).length;
  return `${h.table.seats}-max ${h.table.venue} · ${money(h.table.blinds.sb)}/${money(h.table.blinds.bb)} · ${dealt} players`;
}

function Row({ hand, onOpen, onDelete }: { hand: HandRecord; onOpen: () => void; onDelete?: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-4 py-3 hover:border-accent/60">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 cursor-pointer text-left">
        <div className="font-semibold">
          {hand.handNo !== undefined && <span className="mr-2 text-muted">#{hand.handNo}</span>}
          {hand.title || hand.table.name || (hand.handNo !== undefined ? `Hand #${hand.handNo}` : 'Untitled hand')}
        </div>
        <div className="text-xs text-muted">
          {describe(hand)}
          {hand.events.length === 0 ? ' · no actions yet' : ` · ${hand.events.length} events`}
          {hand.createdAt && ` · ${new Date(hand.createdAt).toLocaleString()}`}
        </div>
      </button>
      <div className="flex gap-2">
        <Button variant="primary" onClick={onOpen}>
          Open
        </Button>
        <Button variant="secondary" onClick={() => downloadJson(`hand-${hand.handNo ?? hand.id}.json`, hand)}>
          Export JSON
        </Button>
        {onDelete && (
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}

/** Your hands open in the Lab (editable); sample hands open as a replay. */
export function HandsList({ onOpen, onWatch }: { onOpen: (hand: HandRecord, editable: boolean) => void; onWatch?: () => void }) {
  const [hands, setHands] = useState(loadHands);
  const [fishy, setFishy] = useState(loadFishy);
  const sessionList = useMemo(() => sessions(hands), [hands]);
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Hands</h1>
        {onWatch && (
          <Button variant="secondary" onClick={onWatch} title="A 6-max table of bots with mixed types: they play every seat, cards face up, hand after hand">
            👀 Watch the bots
          </Button>
        )}
      </div>
      {sessionList.length > 0 && (
        <Section title="Sessions">
          <p className="mb-3 text-xs text-muted">Hands you played one after another (“Deal next hand”), and how Hero did.</p>
          <ul className="space-y-2">
            {sessionList.map((s) => (
              <SessionRow key={s.id} s={s} fishy={fishy.filter((m) => s.hands.some((x) => x.hand.id === m.handId)).length} onOpen={(h) => onOpen(h, true)} />
            ))}
          </ul>
        </Section>
      )}
      <Section title="Your hands">
        {hands.length === 0 ? (
          <p className="text-sm text-muted">No hands yet. Create one with “New hand”.</p>
        ) : (
          <ul className="space-y-2">
            {[...hands].reverse().map((h) => (
              <Row
                key={h.id}
                hand={h}
                onOpen={() => onOpen(h, true)}
                onDelete={() => {
                  if (window.confirm(`Delete hand #${h.handNo ?? ''}?`)) {
                    deleteHand(h.id);
                    setHands(loadHands());
                  }
                }}
              />
            ))}
          </ul>
        )}
      </Section>
      {fishy.length > 0 && (
        <Section title="Smells fishy">
          <p className="mb-2 text-xs text-muted">Bot moves you flagged while watching or playing - cases for calibrating the model.</p>
          <ul className="space-y-2">
            {[...fishy].reverse().map((m) => {
              const h = hands.find((x) => x.id === m.handId);
              return (
                <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line bg-surface-2 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">🐟 {m.note || '(no note)'}</div>
                    <div className="text-xs text-muted">
                      {m.move} · hand #{m.handNo ?? '?'} · {new Date(m.at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {h && (
                      <Button variant="secondary" onClick={() => onOpen(h, true)}>
                        Open hand
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        deleteFishy(m.id);
                        setFishy(loadFishy());
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      <Section title="Sample hands">
        <ul className="space-y-2">
          {Object.values(FIXTURES).map((h) => (
            <Row key={h.id} hand={h} onOpen={() => onOpen(h, false)} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function SessionRow({ s, fishy, onOpen }: { s: Session; fishy: number; onOpen: (h: HandRecord) => void }) {
  const first = s.hands[0]?.hand;
  const money = (v: number) => (first ? formatAmount(v, first.table.currency, first.table.blinds.bb) : String(v));
  const sign = (v: number) => (v > 0 ? '+' : '');
  return (
    <li className="rounded-md border border-line bg-surface-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-semibold">{s.name}</div>
          <div className="text-xs text-muted">
            {new Date(s.at).toLocaleString()} · {s.hands.length} hands{s.unfinished ? ` (+${s.unfinished} unfinished)` : ''}
            {fishy > 0 && ` · 🐟 ${fishy} flagged`}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold tabular-nums ${s.net > 0 ? 'text-ok' : s.net < 0 ? 'text-danger' : ''}`}>
            {sign(s.net)}
            {money(s.net)}
          </div>
          <div className="text-xs text-muted tabular-nums">
            {sign(s.netBB)}
            {s.netBB.toFixed(1)} BB · {sign(s.bbPer100)}
            {s.bbPer100.toFixed(0)} bb/100
          </div>
        </div>
      </div>
      {(s.best || s.worst) && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {s.best && (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onOpen(s.best!.hand)}>
              Best: #{s.best.hand.handNo ?? '?'} ({sign(s.best.netBB)}
              {s.best.netBB.toFixed(1)} BB)
            </Button>
          )}
          {s.worst && (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onOpen(s.worst!.hand)}>
              Worst: #{s.worst.hand.handNo ?? '?'} ({s.worst.netBB.toFixed(1)} BB)
            </Button>
          )}
        </div>
      )}
      <p className="mt-1 text-[11px] text-faint">Over few hands the result is mostly luck: a hundred hands swing by 50 BB or more.</p>
    </li>
  );
}
