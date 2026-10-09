import type { Card } from '../../core/cards';
import { cellCards } from '../../core/live/quick';
import { Segmented } from '../controls';
import { CardGrid } from './CardGrid';
import { HandGrid } from './HandGrid';

export type HoleMode = 'grid' | 'cards';

/**
 * Two hole cards: a hand on the 13x13 grid (one tap, when the suits don't matter: they're a
 * guess, kept off the board's suits) or the exact cards on the card grid.
 */
export function HoleCards({
  mode,
  onMode,
  taken,
  soft,
  board,
  onPick,
}: {
  mode: HoleMode;
  onMode: (m: HoleMode) => void;
  /** Cards in play elsewhere. */
  taken: ReadonlySet<Card>;
  /** Cards of guessed hands, which can still be taken (the hand moves). */
  soft: ReadonlySet<Card>;
  board: readonly Card[];
  onPick: (cards: [Card, Card], guessed: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <Segmented<HoleMode>
        size="sm"
        value={mode}
        onChange={onMode}
        options={[
          { value: 'grid', label: 'Hand (13×13)', title: 'One tap: AKs, QJo, 77 - the suits are a guess' },
          { value: 'cards', label: 'Exact cards', title: 'Two taps: the real cards' },
        ]}
      />
      {mode === 'grid' ? (
        <HandGrid
          blocked={(cell) => !cellCards(cell, taken)}
          onPick={(cell) => {
            const cards = cellCards(cell, taken, board);
            if (cards) onPick(cards, true);
          }}
        />
      ) : (
        <CardGrid count={2} taken={taken} soft={soft} onDone={(cards) => onPick([cards[0]!, cards[1]!], false)} />
      )}
    </div>
  );
}
