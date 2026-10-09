import { useState } from 'react';
import { RANK_CHARS, type Card } from '../../core/cards';
import { Button, Segmented } from '../controls';
import { CardGrid } from './CardGrid';
import { Step } from './parts';

export type BoardMode = 'cards' | 'ranks';

/** Ranks A..2 as big keys (a rank all four of which are in play is off). */
function RankPad({ onRank, used }: { onRank: (rank: number) => void; used: ReadonlySet<Card> }) {
  const free = (r: number) => [0, 1, 2, 3].some((s) => !used.has(s * 13 + r));
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 13 }, (_, i) => 12 - i).map((r) => (
        <button
          key={r}
          type="button"
          disabled={!free(r)}
          onClick={() => onRank(r)}
          className="h-12 rounded-lg border border-line bg-surface-2 text-lg font-bold active:bg-accent active:text-accent-ink disabled:opacity-20"
        >
          {RANK_CHARS[r]}
        </button>
      ))}
    </div>
  );
}

/**
 * The flop, turn or river: the exact cards on the card grid, or only the ranks when the suits
 * weren't seen (the texture comes next: rainbow, two-tone, a flush card, a second flush draw).
 */
export function BoardInput({
  label,
  need,
  mode,
  onMode,
  taken,
  soft,
  onCards,
  onRanks,
}: {
  label: string;
  need: number;
  mode: BoardMode;
  onMode: (m: BoardMode) => void;
  taken: ReadonlySet<Card>;
  soft: ReadonlySet<Card>;
  onCards: (cards: Card[]) => void;
  onRanks: (ranks: number[]) => void;
}) {
  const [draft, setDraft] = useState<number[]>([]);
  const tapRank = (r: number) => {
    const next = [...draft, r];
    if (next.length < need) {
      setDraft(next);
      return;
    }
    setDraft([]);
    onRanks(next);
  };
  return (
    <Step
      title={label}
      aside={
        <Segmented<BoardMode>
          size="sm"
          value={mode}
          onChange={onMode}
          options={[
            { value: 'cards', label: 'Cards' },
            { value: 'ranks', label: 'Ranks only', title: 'Suits not seen: the ranks, then the texture' },
          ]}
        />
      }
    >
      {mode === 'cards' ? (
        <CardGrid count={need} taken={taken} soft={soft} onDone={onCards} />
      ) : (
        <>
          <div className="flex h-12 items-center gap-2">
            {Array.from({ length: need }, (_, i) =>
              draft[i] !== undefined ? (
                <span key={i} className="flex h-12 w-9 items-center justify-center rounded border border-line bg-surface-2 text-lg font-bold">
                  {RANK_CHARS[draft[i]!]}
                </span>
              ) : (
                <span key={i} className="h-12 w-9 rounded border border-dashed border-line" />
              ),
            )}
            {draft.length > 0 && (
              <Button variant="ghost" onClick={() => setDraft([])}>
                Clear
              </Button>
            )}
          </div>
          <RankPad onRank={tapRank} used={taken} />
        </>
      )}
    </Step>
  );
}
