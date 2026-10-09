import { CELL_NAMES, cellKind } from '../../core/ranges/hands';

/** The 13x13 starting hands: one tap = a hand. Blocked cells (cards in play) are dimmed. */
export function HandGrid({ onPick, blocked }: { onPick: (cell: number) => void; blocked?: (cell: number) => boolean }) {
  return (
    <div className="grid grid-cols-13 gap-px overflow-hidden rounded-lg border border-line bg-line select-none">
      {CELL_NAMES.map((name, cell) => {
        const kind = cellKind(cell);
        const off = blocked?.(cell) ?? false;
        return (
          <button
            key={cell}
            type="button"
            disabled={off}
            onClick={() => onPick(cell)}
            className={`flex aspect-square items-center justify-center text-[9px] leading-none font-semibold sm:text-[11px] disabled:opacity-20 active:bg-accent active:text-accent-ink ${
              kind === 'pair' ? 'bg-surface-3 text-ink' : kind === 'suited' ? 'bg-surface-2 text-ink' : 'bg-surface text-muted'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
