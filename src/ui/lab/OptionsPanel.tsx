import { useState, type ReactNode } from 'react';
import type { SizeQuestion, SizeRow } from '../../core/motives/sizes';
import { Modal } from '../controls';
import type { Money } from '../replay/views';
import { EvTable } from './EvTable';
import { SizeExplorer } from './SizeExplorer';
import { WhatIf } from './WhatIf';

type Tab = 'ev' | 'answers' | 'next';

/**
 * Options: everything about "what are my options here, and what happens with each", in one
 * panel - the EV of each (with "Stable?"), how the others answer each size bucket by bucket, and
 * what reaches the next street. Used to be three windows.
 */
export function OptionsPanel({
  title,
  spot,
  q,
  money,
  names,
  canAnswers,
  whatIf,
  onUse,
  onClose,
}: {
  title: string;
  spot: ReactNode;
  q: SizeQuestion;
  money: Money;
  names: Record<number, string>;
  /** Bet and raise sizes to explore (the player may bet or raise). */
  canAnswers: boolean;
  /** Heads-up on the flop or turn: the next-street view, with the names for it. */
  whatIf?: { otherName: string; actorName: string };
  onUse?: (row: SizeRow) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('ev');
  const tabs: { id: Tab; label: string; title: string }[] = [
    { id: 'ev', label: 'EV', title: 'The EV of each option this street, and whether the best one holds when the reads are a little off' },
    ...(canAnswers ? [{ id: 'answers' as const, label: 'How they answer', title: 'Each size: who folds, calls or raises, bucket by bucket, and what it shows of your range' }] : []),
    ...(whatIf ? [{ id: 'next' as const, label: 'Next street', title: 'Check, bet small or big: what reaches the next street, on a blank or a scare card' }] : []),
  ];
  return (
    <Modal title={title} subtitle={spot} wide="xl" onClose={onClose}>
      {tabs.length > 1 && (
        <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              title={t.title}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.id ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {tab === 'ev' && <EvTable q={q} money={money} names={names} auto onUse={onUse} />}
      {tab === 'answers' && <SizeExplorer q={q} money={money} names={names} onUse={onUse} />}
      {tab === 'next' && whatIf && <WhatIf q={q} money={money} otherName={whatIf.otherName} actorName={whatIf.actorName} />}
    </Modal>
  );
}
