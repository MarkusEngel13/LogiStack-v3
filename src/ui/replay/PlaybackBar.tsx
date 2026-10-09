import type { Street } from '../../core/engine/state';
import { Segmented } from '../controls';
import { streetName } from './views';

export const ICONS = {
  first: 'M6 5h2v14H6zM20 5v14L9 12z',
  prev: 'M17 5v14L6 12z',
  play: 'M7 5v14l12-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  next: 'M7 5v14l11-7z',
  last: 'M16 5h2v14h-2zM4 5v14l11-7z',
  nextHand: 'M3 5v14l9-7zM12 5v14l9-7z',
  stop: 'M6 6h12v12H6z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z',
};

/**
 * A square icon button; `big` is the play / pause button: bigger on a phone, where it must be
 * easy to hit.
 */
export function IconButton({ icon, title, onClick, disabled, big }: { icon: keyof typeof ICONS; title: string; onClick: () => void; disabled?: boolean; big?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-30 ${
        big ? 'h-12 w-16 bg-accent text-accent-ink hover:bg-accent-strong sm:h-10 sm:w-12' : 'h-10 w-10 bg-surface-2 text-ink hover:bg-surface-3'
      }`}
    >
      <svg viewBox="0 0 24 24" className={big ? 'h-6 w-6 sm:h-5 sm:w-5' : 'h-4 w-4'} fill="currentColor">
        <path d={ICONS[icon]} />
      </svg>
    </button>
  );
}

const STREETS: (Street | 'result')[] = ['preflop', 'flop', 'turn', 'river', 'result'];

/**
 * The replay's control bar, right under the table. Its size never changes during a hand: all five
 * streets are always there (the ones not reached yet greyed out) and the step count has a fixed
 * width, so nothing moves when an action comes in.
 */
export function PlaybackBar({
  step,
  last,
  playing,
  speed,
  streets,
  onStep,
  onTogglePlay,
  onSpeed,
  onNextHand,
  nextReady = false,
  onStop,
  stopTitle = 'Back',
  compact = false,
}: {
  step: number;
  last: number;
  playing: boolean;
  speed: number;
  streets: Partial<Record<Street | 'result', number>>;
  onStep: (step: number) => void;
  onTogglePlay: () => void;
  onSpeed: (speed: number) => void;
  /** Deal the next hand at this table; the button waits (greyed out) until the hand is over. */
  onNextHand?: () => void;
  nextReady?: boolean;
  /** Leave the hand (full screen, where the page's back button is hidden). */
  onStop?: () => void;
  stopTitle?: string;
  /** Full screen: on a small screen the street buttons and the step count make room for the table. */
  compact?: boolean;
}) {
  const reached = STREETS.filter((s) => streets[s] !== undefined);
  // The street the current step belongs to: the last jump target at or before it.
  const currentStreet = [...reached].reverse().find((s) => streets[s]! <= step) ?? 'preflop';

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-line bg-surface px-2 py-2 sm:px-4 sm:py-3">
      <div className="flex items-center gap-1.5">
        <IconButton icon="first" title="Start (Home)" onClick={() => onStep(0)} disabled={step === 0} />
        <IconButton icon="prev" title="Back (←)" onClick={() => onStep(step - 1)} disabled={step === 0} />
        <IconButton icon={playing ? 'pause' : 'play'} title={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={onTogglePlay} disabled={last === 0} big />
        <IconButton icon="next" title="Next (→)" onClick={() => onStep(step + 1)} disabled={step === last} />
        <IconButton icon="last" title="End (End)" onClick={() => onStep(last)} disabled={step === last} />
        <span className={`ml-1.5 w-16 text-sm whitespace-nowrap text-muted tabular-nums sm:ml-3 sm:w-28 ${compact ? 'hidden lg:inline' : ''}`}>
          <span className="hidden sm:inline">Step </span>
          {step} / {last}
        </span>
      </div>
      <div className={`gap-0.5 rounded-md border border-line bg-surface-2 p-1 sm:gap-1 ${compact ? 'hidden lg:inline-flex' : 'inline-flex'}`}>
        {STREETS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={streets[s] === undefined}
            onClick={() => onStep(streets[s]!)}
            className={`rounded px-2 py-1 text-xs transition-colors disabled:opacity-35 sm:px-3 ${
              s === currentStreet ? 'bg-accent font-semibold text-accent-ink' : 'text-muted enabled:hover:bg-surface-3 enabled:hover:text-ink'
            }`}
          >
            {streetName(s)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Segmented
          size="sm"
          value={speed}
          options={[0.5, 1, 2].map((v) => ({ value: v, label: `${v}×`, title: 'Playback speed' }))}
          onChange={onSpeed}
        />
        {onNextHand && (
          <IconButton icon="nextHand" title="Deal the next hand at this table (N)" onClick={onNextHand} disabled={!nextReady} />
        )}
        {onStop && <IconButton icon="back" title={stopTitle} onClick={onStop} />}
      </div>
    </div>
  );
}
