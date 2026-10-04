import { useState } from 'react';
import { cardToString, parseCard, RANK_CHARS } from '../../core/cards';
import type { CardStr } from '../../core/hand/types';
import { Button, Modal } from '../controls';
import { PlayingCard } from './PlayingCard';

const SUIT_ROWS = [0, 1, 2, 3]; // s h d c
const RANKS_HIGH_FIRST = [...RANK_CHARS].map((_, i) => 12 - i);

/** Pick two hole cards. Cards in `taken` (other players, board) are greyed out. */
export function CardPicker({
  initial,
  taken,
  title,
  onDone,
  onClose,
}: {
  initial: [CardStr, CardStr] | null;
  taken: Set<number>;
  title: string;
  onDone: (cards: [CardStr, CardStr] | null) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<number[]>(initial ? initial.map(parseCard) : []);

  const toggle = (card: number) =>
    setPicked((p) => (p.includes(card) ? p.filter((c) => c !== card) : p.length < 2 ? [...p, card] : [p[1]!, card]));

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={() => onDone(null)}>
            Unknown
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={picked.length !== 2}
            onClick={() => onDone([cardToString(picked[0]!), cardToString(picked[1]!)])}
          >
            Done
          </Button>
        </>
      }
    >
      <div className="mb-4 flex h-24 items-center justify-center gap-2">
        {[0, 1].map((i) =>
          picked[i] !== undefined ? (
            <PlayingCard key={i} card={picked[i]!} width="60px" />
          ) : (
            <div key={i} className="flex h-[84px] w-[60px] items-center justify-center rounded-md border border-dashed border-line text-xs text-faint">
              ?
            </div>
          ),
        )}
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
        {SUIT_ROWS.flatMap((suit) =>
          RANKS_HIGH_FIRST.map((rank) => {
            const card = suit * 13 + rank;
            const isTaken = taken.has(card) && !picked.includes(card);
            const isPicked = picked.includes(card);
            return (
              <button
                key={card}
                type="button"
                disabled={isTaken}
                onClick={() => toggle(card)}
                className={`rounded py-1.5 text-center text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-20 ${
                  isPicked ? 'ring-2 ring-accent' : 'hover:brightness-110'
                }`}
                style={{
                  background: 'var(--card-face)',
                  color: ['var(--suit-s)', 'var(--suit-h)', 'var(--suit-d)', 'var(--suit-c)'][suit],
                }}
              >
                {RANK_CHARS[rank] === 'T' ? '10' : RANK_CHARS[rank]}
                {['♠', '♥', '♦', '♣'][suit]}
              </button>
            );
          }),
        )}
      </div>
    </Modal>
  );
}
