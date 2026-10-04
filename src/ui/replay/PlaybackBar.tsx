import type { Street } from '../../core/engine/state';
import { Segmented } from '../controls';
import { streetName } from './views';

const ICONS = {
  first: 'M6 5h2v14H6zM20 5v14L9 12z',
  prev: 'M17 5v14L6 12z',
  play: 'M7 5v14l12-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  next: 'M7 5v14l11-7z',
  last: 'M16 5h2v14h-2zM4 5v14l11-7z',
};

function IconButton({ icon, title, onClick, disabled, big }: { icon: keyof typeof ICONS; title: string; onClick: () => void; disabled?: boolean; big?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center rounded-md transition-colors disabled:opacity-30 ${
        big ? 'h-10 w-12 bg-accent text-accent-ink hover:bg-accent-strong' : 'h-10 w-10 bg-surface-2 text-ink hover:bg-surface-3'
      }`}
    >
      <svg viewBox="0 0 24 24" className={big ? 'h-5 w-5' : 'h-4 w-4'} fill="currentColor">
        <path d={ICONS[icon]} />
      </svg>
    </button>
  );
}

const STREETS: (Street | 'result')[] = ['preflop', 'flop', 'turn', 'river', 'result'];

export function PlaybackBar({
  step,
  last,
  playing,
  speed,
  streets,
  onStep,
  onTogglePlay,
  onSpeed,
}: {
  step: number;
  last: number;
  playing: boolean;
  speed: number;
  streets: Partial<Record<Street | 'result', number>>;
  onStep: (step: number) => void;
  onTogglePlay: () => void;
  onSpeed: (speed: number) => void;
}) {
  const reached = STREETS.filter((s) => streets[s] !== undefined);
  // The street the current step belongs to: the last jump target at or before it.
  const currentStreet = [...reached].reverse().find((s) => streets[s]! <= step) ?? 'preflop';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5">
        <IconButton icon="first" title="Start (Home)" onClick={() => onStep(0)} disabled={step === 0} />
        <IconButton icon="prev" title="Back (←)" onClick={() => onStep(step - 1)} disabled={step === 0} />
        <IconButton icon={playing ? 'pause' : 'play'} title={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={onTogglePlay} disabled={last === 0} big />
        <IconButton icon="next" title="Next (→)" onClick={() => onStep(step + 1)} disabled={step === last} />
        <IconButton icon="last" title="End (End)" onClick={() => onStep(last)} disabled={step === last} />
        <span className="ml-3 text-sm text-muted tabular-nums">
          Step {step} / {last}
        </span>
      </div>
      <Segmented
        size="sm"
        value={currentStreet}
        options={reached.map((s) => ({ value: s, label: streetName(s) }))}
        onChange={(s) => onStep(streets[s]!)}
      />
      <Segmented
        size="sm"
        value={speed}
        options={[0.5, 1, 2].map((v) => ({ value: v, label: `${v}×`, title: 'Playback speed' }))}
        onChange={onSpeed}
      />
    </div>
  );
}
