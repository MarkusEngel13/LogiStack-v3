import { useState } from 'react';
import { RANK_CHARS, cardToString, type Card } from '../../core/cards';
import { PlayingCard, SUIT_VARS, suitTone } from '../cards/PlayingCard';
import { useSettings } from '../settings';

const SUIT_SYMBOL = ['♠', '♥', '♦', '♣'];
const RANKS_HIGH_FIRST = Array.from({ length: 13 }, (_, i) => 12 - i);

/**
 * The 52 cards as big keys for a thumb: per suit two rows of seven (A-8, then 7-2 and the suit),
 * like the rank pad. Tap `count` cards - a tapped one again takes it back - and the last tap hands
 * them over. Cards in play are off, except `soft` ones (suits guessed from the 13x13 grid): taking
 * one moves that hand to other suits.
 */
export function CardGrid({ count, taken, soft, onDone }: { count: number; taken: ReadonlySet<Card>; soft?: ReadonlySet<Card>; onDone: (cards: Card[]) => void }) {
  const { settings } = useSettings();
  const [picked, setPicked] = useState<Card[]>([]);

  const tap = (c: Card) => {
    if (picked.includes(c)) {
      setPicked(picked.filter((x) => x !== c));
      return;
    }
    const next = [...picked, c];
    if (next.length < count) {
      setPicked(next);
      return;
    }
    setPicked([]);
    onDone(next);
  };

  return (
    <div className="space-y-2 select-none">
      {count > 1 && (
        <div className="flex h-11 items-center gap-1.5">
          {Array.from({ length: count }, (_, i) =>
            picked[i] !== undefined ? (
              <PlayingCard key={i} card={picked[i]!} width="2rem" mini />
            ) : (
              <div key={i} className="rounded border border-dashed border-line" style={{ width: '2rem', aspectRatio: '5 / 7' }} />
            ),
          )}
          {picked.length > 0 && (
            <button type="button" className="ml-1 text-xs text-muted underline" onClick={() => setPicked([])}>
              clear
            </button>
          )}
        </div>
      )}
      {[0, 1, 2, 3].map((suit) => {
        const color = SUIT_VARS[suitTone(suit, settings.fourColor)];
        return (
          <div key={suit} className="grid grid-cols-7 gap-1">
            {RANKS_HIGH_FIRST.map((rank) => {
              const c = suit * 13 + rank;
              const isSoft = !!soft?.has(c);
              const off = taken.has(c) && !isSoft;
              const on = picked.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  disabled={off}
                  aria-label={cardToString(c)}
                  aria-pressed={on}
                  title={isSoft ? 'A guessed hand holds it: taking it moves that hand' : undefined}
                  onClick={() => tap(c)}
                  className={`flex h-11 items-center justify-center gap-px rounded-md leading-none font-bold transition-transform active:scale-95 disabled:opacity-15 ${
                    on ? 'opacity-50 ring-3 ring-accent' : isSoft ? 'opacity-70 outline-2 outline-offset-[-3px] outline-dashed' : ''
                  }`}
                  style={{ background: 'var(--card-face)', color }}
                >
                  <span className="text-lg">{RANK_CHARS[rank] === 'T' ? '10' : RANK_CHARS[rank]}</span>
                  <span className="text-base">{SUIT_SYMBOL[suit]}</span>
                </button>
              );
            })}
            <div className="flex items-center justify-center text-2xl text-faint" aria-hidden>
              {SUIT_SYMBOL[suit]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
