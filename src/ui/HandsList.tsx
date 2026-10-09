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

/**
 * A hand in a list. On a phone the title gets its own full line and the buttons a compact row
 * under it (side by side, three full-size buttons squeezed the title onto 3-5 lines); a click on
 * the text opens the hand too.
 */
export function Row({ hand, onOpen, onDelete }: { hand: HandRecord; onOpen: () => void; onDelete?: () => void }) {
  const small = '!px-2.5 !py-1 text-xs';
  return (
    <li className="flex flex-col gap-2 rounded-md border border-line bg-surface-2 px-4 py-3 hover:border-accent/60 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <button type="button" onClick={onOpen} className="min-w-0 cursor-pointer text-left sm:flex-1">
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
      <div className="flex shrink-0 gap-1.5">
        <Button variant="primary" onClick={onOpen} className={small}>
          Open
        </Button>
        <Button variant="secondary" onClick={() => downloadJson(`hand-${hand.handNo ?? hand.id}.json`, hand)} className={small} title="Export the hand as JSON">
          ⬇<span className="hidden sm:inline"> JSON</span>
        </Button>
        {onDelete && (
          <Button variant="danger" onClick={onDelete} className={small} title="Delete the hand">
            🗑<span className="hidden sm:inline"> Delete</span>
          </Button>
        )}
      </div>
    </li>
  );
}

/** The Lab: your hands open editable, sample hands as a replay; a new hand starts here. */
export function HandsList({ onOpen, onNew }: { onOpen: (hand: HandRecord, editable: boolean) => void; onNew: () => void }) {
  const [hands, setHands] = useState(loadHands);
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-3 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Lab</h1>
          <p className="text-xs text-muted">Your hands: replay them, study the ranges, ask what if.</p>
        </div>
        <Button variant="primary" onClick={onNew}>
          ＋ New hand
        </Button>
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

