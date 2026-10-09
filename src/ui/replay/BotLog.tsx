import { useState } from 'react';

const OPEN_KEY = 'logistack.botLogOpen';

/**
 * How the bots decided: every bot move of the hand with its chances, newest on top. It sits at the
 * bottom of the page, under everything else, so its growing never moves the table or the controls.
 * Folded or open is remembered in this browser.
 */
export function BotLog({ entries, fishyNote, onFishy }: { entries: { step: number; text: string }[]; fishyNote: string | null; onFishy: (step: number, text: string) => void }) {
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const setOpen = (on: boolean) => {
    setOpenState(on);
    try {
      localStorage.setItem(OPEN_KEY, on ? '1' : '0');
    } catch {
      // storage blocked: folded or open lasts for this page only
    }
  };

  return (
    <div className="rounded-lg border border-line bg-surface text-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-bold tracking-wider text-muted uppercase hover:text-ink"
      >
        <span className="inline-block w-3 text-center">{open ? '▾' : '▸'}</span>
        How the bots decided
        <span className="font-normal tracking-normal normal-case text-faint">
          {entries.length} {entries.length === 1 ? 'move' : 'moves'}, newest first
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          <ul className="space-y-1 text-muted">
            {[...entries].reverse().map((x) => (
              <li key={x.step} className="group flex items-start gap-2">
                <span className="flex-1">🤖 {x.text}</span>
                <button
                  type="button"
                  className="shrink-0 rounded px-1 text-xs opacity-40 group-hover:opacity-100 hover:bg-surface-2"
                  title="Smells fishy: note what's wrong with this move (kept for calibrating the model)"
                  onClick={() => onFishy(x.step, x.text)}
                >
                  🐟
                </button>
              </li>
            ))}
          </ul>
          {fishyNote && <p className="mt-1 text-xs text-accent">{fishyNote}</p>}
        </div>
      )}
    </div>
  );
}
