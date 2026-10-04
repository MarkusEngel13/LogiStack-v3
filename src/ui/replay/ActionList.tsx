import { useEffect, useRef } from 'react';
import { PlayingCard } from '../cards/PlayingCard';
import { TONE_COLORS } from '../table/PokerTable';
import { streetName, type ListRow } from './views';

/**
 * The hand history on the right. Rows after the current step are dimmed; clicking a row jumps
 * there. Result rows appear once the replay reaches the end.
 */
export function ActionList({ rows, step, atEnd, onJump }: { rows: ListRow[]; step: number; atEnd: boolean; onJump: (step: number) => void }) {
  const isFuture = (r: ListRow) => (r.event === Infinity ? !atEnd : r.event >= step);
  let current = -1;
  rows.forEach((r, i) => {
    if (!isFuture(r) && r.event !== Infinity) current = i;
  });

  const currentRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // At the end, bring the result rows into view; otherwise follow the current row.
    if (atEnd && listRef.current) listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    else currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [current, atEnd]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-4 py-2.5 text-xs font-bold tracking-wider text-muted uppercase">Action</div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {rows.map((r, i) => {
          const future = isFuture(r);
          const tone = TONE_COLORS[r.tone];
          return (
            <div key={r.key} ref={i === current ? currentRef : undefined}>
              {r.street && (
                <div className="mt-2 mb-1 px-1 text-[11px] font-bold tracking-wider text-faint uppercase first:mt-0">{streetName(r.street)}</div>
              )}
              <div
                role={r.step !== null ? 'button' : undefined}
                onClick={r.step !== null ? () => onJump(r.step!) : undefined}
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] ${r.step !== null ? 'cursor-pointer hover:bg-surface-3' : ''} ${
                  i === current ? 'bg-surface-3 ring-1 ring-accent' : 'bg-surface-2'
                }`}
                style={{ borderLeft: `3px solid ${tone.bg}`, opacity: future ? 0.35 : 1 }}
              >
                <span className="min-w-0 flex-1">{r.cards && r.tone === 'info' && r.street ? <span className="text-muted">{r.text}</span> : r.text}</span>
                {r.cards && (
                  <span className="flex shrink-0 gap-0.5">
                    {r.cards.map((c) => (
                      <PlayingCard key={c} card={c} width="20px" />
                    ))}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
