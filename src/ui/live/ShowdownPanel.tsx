import { useState } from 'react';
import type { Card } from '../../core/cards';
import type { TableState } from '../../core/engine/state';
import type { HandRecord, SeatNo } from '../../core/hand/types';
import { softCards, usedCards } from '../../core/live/quick';
import { PlayingCard } from '../cards/PlayingCard';
import { Button } from '../controls';
import { playerTypeColor } from '../playerTypes';
import { HoleCards, type HoleMode } from './HoleCards';
import { Key } from './parts';

/**
 * The cards seen at showdown. At any moment of the hand ("Showdown" in the header): tap who
 * showed, then his cards, so they're down before you forget them - the actions can follow later.
 * At the showdown itself: each player still in shows or mucks, and you can muck a beaten hand.
 */
export function ShowdownPanel({
  hand,
  state,
  mode,
  onMode,
  nameOf,
  onCards,
  onMuck,
  onClose,
}: {
  hand: HandRecord;
  state: TableState;
  mode: HoleMode;
  onMode: (m: HoleMode) => void;
  nameOf: (seat: SeatNo) => string;
  onCards: (seat: SeatNo, cards: [Card, Card], guessed: boolean) => void;
  onMuck: (seat: SeatNo) => void;
  /** Early (before the showdown): back to the hand. */
  onClose?: () => void;
}) {
  const atShowdown = state.phase === 'showdown';
  const players = state.seats.filter((s) => s.dealtIn && !s.folded && !s.mucked && s.seat !== hand.hero);
  const unknown = players.filter((s) => !s.cards);
  const [target, setTarget] = useState<SeatNo | null>(unknown[0]?.seat ?? null);
  const heroState = state.seats.find((s) => s.seat === hand.hero);

  const own = state.seats.find((s) => s.seat === target)?.cards ?? [];
  const taken = new Set([...usedCards(state)].filter((c) => !own.includes(c)));
  const pick = (cards: [Card, Card], guessed: boolean) => {
    if (target === null) return;
    onCards(target, cards, guessed);
    setTarget(unknown.find((s) => s.seat !== target)?.seat ?? null);
  };

  return (
    <section className="space-y-3 rounded-xl border border-accent/40 bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">{atShowdown ? 'Showdown' : 'Cards seen at showdown'}</h2>
        {onClose && (
          <Button variant="ghost" onClick={onClose} className="!px-2">
            ✕
          </Button>
        )}
      </div>
      {!atShowdown && <p className="text-xs text-faint">Kept as their hole cards: the showdown decides itself once the actions are in.</p>}

      <div className="space-y-1.5">
        {players.map((s) => (
          <div key={s.seat} className="flex items-center gap-1.5">
            <span
              className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface-2 px-2 py-2 text-sm font-semibold"
              style={{ borderLeft: `4px solid ${playerTypeColor(s.playerType) ?? 'var(--color-line)'}` }}
            >
              <span className="mr-1 text-[10px] font-normal text-faint">{s.position}</span>
              {nameOf(s.seat)}
            </span>
            {s.cards && (
              <span className="flex shrink-0 gap-0.5">
                {s.cards.map((c) => (
                  <PlayingCard key={c} card={c} width="1.7rem" mini />
                ))}
              </span>
            )}
            <Key active={target === s.seat} onClick={() => setTarget(target === s.seat ? null : s.seat)} className="w-20 shrink-0">
              {s.cards ? 'Change' : 'Shows…'}
            </Key>
            {atShowdown && !s.cards && (
              <Key onClick={() => onMuck(s.seat)} className="w-16 shrink-0">
                Mucks
              </Key>
            )}
          </div>
        ))}
      </div>

      {atShowdown && heroState && !heroState.folded && !heroState.mucked && (
        <Key tone="danger" onClick={() => onMuck(heroState.seat)} className="w-full">
          I muck (beaten)
        </Key>
      )}

      {target !== null && (
        <div className="space-y-1.5">
          <p className="text-xs text-faint">{nameOf(target)} shows:</p>
          <HoleCards mode={mode} onMode={onMode} taken={taken} soft={softCards(hand, target)} board={state.board} onPick={pick} />
        </div>
      )}

      {onClose && (
        <Button variant="primary" className="w-full !py-3" onClick={onClose}>
          Done · back to the hand
        </Button>
      )}
    </section>
  );
}
