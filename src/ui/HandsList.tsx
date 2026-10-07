import { useState } from 'react';
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
