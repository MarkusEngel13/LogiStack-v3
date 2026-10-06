import { useState } from 'react';
import { cardToString, parseCard, RANK_CHARS } from '../../core/cards';
import type { CardStr } from '../../core/hand/types';
import { Button, Modal } from '../controls';
import { useSettings } from '../settings';
import { PlayingCard, SUIT_VARS, suitTone } from './PlayingCard';

const SUIT_ROWS = [0, 1, 2, 3]; // s h d c
const RANKS_HIGH_FIRST = [...RANK_CHARS].map((_, i) => 12 - i);

/**
 * Pick `count` cards: two hole cards, three for the flop, one for the turn or river.
 * Cards in `taken` (other players, the board) are greyed out.
 */
export function CardPicker({
  count = 2,
  validCounts,
  initial,
  taken,
  title,
  allowUnknown = true,
  onDone,
  onClose,
}: {
  count?: number;
  /** Instead of exactly `count`: any of these numbers of cards (a board: 0, 3, 4 or 5). */
  validCounts?: number[];
  initial: CardStr[] | null;
  taken: Set<number>;
  title: string;
  /** Offer an "Unknown" button (hole cards you didn't see). */
  allowUnknown?: boolean;
  onDone: (cards: CardStr[] | null) => void;
  onClose: () => void;
}) {
  const { settings } = useSettings();
  const [picked, setPicked] = useState<number[]>(initial ? initial.map(parseCard) : []);

  const max = validCounts ? Math.max(...validCounts) : count;
  const complete = validCounts ? validCounts.includes(picked.length) : picked.length === count;

  // Clicking a picked card removes it; when full, a new pick replaces the oldest one.
  const toggle = (card: number) =>
    setPicked((p) => (p.includes(card) ? p.filter((c) => c !== card) : p.length < max ? [...p, card] : [...p.slice(1), card]));

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {allowUnknown && (
            <Button variant="ghost" onClick={() => onDone(null)}>
              Unknown
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!complete} onClick={() => onDone(picked.map(cardToString))}>
            Done
          </Button>
        </>
      }
    >
      <div className="mb-4 flex h-24 items-center justify-center gap-2">
        {Array.from({ length: max }, (_, i) =>
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
                aria-label={cardToString(card)}
                onClick={() => toggle(card)}
                aria-pressed={isPicked}
                title={isPicked ? 'Picked: click to take it back' : undefined}
                className={`rounded py-1.5 text-center text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-20 ${
                  isPicked ? 'opacity-45 ring-2 ring-accent' : 'hover:brightness-110'
                }`}
                style={{ background: 'var(--card-face)', color: SUIT_VARS[suitTone(suit, settings.fourColor)] }}
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
