import { useEffect, useMemo, useState } from 'react';
import type { HandRecord } from '../../core/hand/types';
import { Button } from '../controls';
import { SQUID_ICON } from '../playerTypes';
import { useSettings } from '../settings';
import { PokerTable } from '../table/PokerTable';
import { ActionList } from './ActionList';
import { PlaybackBar } from './PlaybackBar';
import { TableCenter } from './TableCenter';
import { actionRows, anchorSeat, moneyFor, replaySeatViews, resultSummary, safeSteps, streetSteps } from './views';

const STEP_MS = 1100;

export function ReplayScreen({ hand, onBack }: { hand: HandRecord; onBack: () => void }) {
  const { settings } = useSettings();
  const { steps, error } = useMemo(() => safeSteps(hand), [hand]);
  const last = steps.length - 1;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const go = (s: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(last, s)));
  };

  // Autoplay: one step per tick, stop at the end.
  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => Math.min(last, s + 1)), STEP_MS / speed);
    return () => clearTimeout(t);
  }, [playing, step, last, speed]);

  // Keyboard: ←/→ step, Space play/pause, Home/End.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') go(step + 1);
      else if (e.key === 'ArrowLeft') go(step - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(last);
      else if (e.key === ' ') {
        e.preventDefault();
        if (step >= last) setStep(0);
        setPlaying((p) => !p);
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const money = useMemo(() => moneyFor(hand, settings.amounts), [hand, settings.amounts]);
  const rows = useMemo(() => actionRows(hand, steps[last]!, money), [hand, steps, last, money]);
  const streets = useMemo(() => streetSteps(steps), [steps]);
  const state = steps[step]!;

  const t = hand.table;
  const details = [
    `${t.seats}-max ${t.venue === 'home' ? 'home game' : 'casino'}`,
    `${money(t.blinds.sb)}/${money(t.blinds.bb)}`,
    t.ante ? `${t.ante.kind === 'bb' ? 'BB ante' : 'ante'} ${money(t.ante.amount)}` : null,
    t.rake ? `rake ${Math.round(t.rake.percent * 1000) / 10}%${t.rake.cap ? ` (cap ${money(t.rake.cap)})` : ''}` : null,
    t.name ?? null,
  ].filter(Boolean);
  const badges = [
    hand.straddles?.length ? `Straddle ${money(hand.straddles[0]!.amount)}` : null,
    hand.sideGames?.sevenDeuce ? `7-2 game ${money(hand.sideGames.sevenDeuce.bounty)}` : null,
    hand.sideGames?.squid ? `${SQUID_ICON} Squid ${money(hand.sideGames.squid.value)}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" onClick={onBack}>
            ← Hands
          </Button>
          <div>
            <h1 className="text-xl font-bold">
              {hand.handNo !== undefined && <span className="mr-2 text-muted">#{hand.handNo}</span>}
              {hand.title || t.name || 'Hand'}
            </h1>
            <p className="text-sm text-muted">{details.join(' · ')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {badges.map((b) => (
            <span key={b} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-ink">
              {b}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/50 bg-danger/10 px-4 py-2 text-sm text-danger">
          The replay stops at event {(error.eventIndex ?? 0) + 1}: {error.message.replace(/^Event \d+: /, '')}
        </div>
      )}
      {hand.events.length === 0 && (
        <div className="mb-4 rounded-md border border-line bg-surface px-4 py-2 text-sm text-muted">
          No actions entered yet - this shows the table after the blinds. Entering the actions comes with the Lab, the next step.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface/60 p-2">
            <PokerTable
              size={t.seats}
              anchorSeat={anchorSeat(hand)}
              buttonSeat={hand.button}
              seats={replaySeatViews(hand, state, { money, showAllCards: settings.showAllCards, isLastStep: step === last })}
              center={<TableCenter state={state} money={money} summary={step === last ? resultSummary(hand, state.result, money) : []} />}
            />
          </div>
          <PlaybackBar
            step={step}
            last={last}
            playing={playing}
            speed={speed}
            streets={streets}
            onStep={go}
            onTogglePlay={() => {
              if (step >= last) setStep(0);
              setPlaying((p) => !p);
            }}
            onSpeed={setSpeed}
          />
        </div>
        <div className="xl:h-[calc(100vh-170px)] xl:max-h-[760px]">
          <ActionList rows={rows} step={step} atEnd={step === last} onJump={go} />
        </div>
      </div>
    </div>
  );
}
