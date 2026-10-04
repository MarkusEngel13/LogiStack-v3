import { useState } from 'react';
import { FIXTURES } from '../core/fixtures';
import type { HandRecord } from '../core/hand/types';
import { Button, Section } from './controls';
import { formatAmount } from './format';
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

export function HandsList({ onOpen }: { onOpen: (hand: HandRecord) => void }) {
  const [hands, setHands] = useState(loadHands);
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
      <h1 className="text-xl font-bold">Hands</h1>
      <Section title="Your hands">
        {hands.length === 0 ? (
          <p className="text-sm text-muted">No hands yet. Create one with “New hand”.</p>
        ) : (
          <ul className="space-y-2">
            {[...hands].reverse().map((h) => (
              <Row
                key={h.id}
                hand={h}
                onOpen={() => onOpen(h)}
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
      <Section title="Sample hands">
        <ul className="space-y-2">
          {Object.values(FIXTURES).map((h) => (
            <Row key={h.id} hand={h} onOpen={() => onOpen(h)} />
          ))}
        </ul>
      </Section>
    </div>
  );
}
