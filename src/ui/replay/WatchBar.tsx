import { IconButton, ICONS } from './PlaybackBar';

/**
 * Watching the bots: the one control bar, right under the table (and at the bottom of the full
 * screen). Fixed height, fixed buttons: nothing in it appears, goes or changes width when a bot
 * acts or the hand ends, so the pause button is always where it was.
 */
export function WatchBar({
  halted,
  onTogglePause,
  onStep,
  canStep,
  speed,
  speeds,
  onSpeed,
  onNextHand,
  onStop,
  stopTitle,
}: {
  /** Paused, or back in the hand: the bots wait. */
  halted: boolean;
  onTogglePause: () => void;
  onStep: () => void;
  canStep: boolean;
  speed: number;
  speeds: readonly number[];
  onSpeed: (speed: number) => void;
  onNextHand?: () => void;
  onStop: () => void;
  stopTitle: string;
}) {
  const pauseTitle = halted ? 'Go on (Space)' : 'Pause (Space)';
  return (
    <div className="flex h-16 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 sm:gap-2 sm:px-3">
      <button
        type="button"
        title={pauseTitle}
        aria-label={pauseTitle}
        onClick={onTogglePause}
        className="flex h-12 w-16 shrink-0 items-center justify-center gap-2 rounded-md bg-accent font-semibold text-accent-ink transition-colors hover:bg-accent-strong sm:w-32"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
          <path d={halted ? ICONS.play : ICONS.pause} />
        </svg>
        <span className="hidden w-12 text-left sm:inline">{halted ? 'Go on' : 'Pause'}</span>
      </button>
      <IconButton icon="last" title="Step: one move (a deal, an action, or the next hand)" onClick={onStep} disabled={!canStep} />
      <span className="ml-1 hidden text-xs text-muted sm:inline">Speed</span>
      <div className="flex shrink-0 rounded-md border border-line bg-surface-2 p-0.5" role="group" aria-label="Speed">
        {speeds.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onSpeed(v)}
            title={`Speed ${v}×`}
            className={`h-9 w-[30px] rounded text-xs sm:w-9 ${v === speed ? 'bg-accent font-bold text-accent-ink' : 'text-muted hover:text-ink'}`}
          >
            {v === 0.5 ? '½×' : `${v}×`}
          </button>
        ))}
      </div>
      <span className="flex-1" />
      {onNextHand && (
        <IconButton icon="nextHand" title="Next hand (N): a hand still running is dropped, the stacks stay as they were before it" onClick={onNextHand} />
      )}
      <IconButton icon="stop" title={stopTitle} onClick={onStop} />
    </div>
  );
}
