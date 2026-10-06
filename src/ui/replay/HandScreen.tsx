import { useEffect, useMemo, useState } from 'react';
import { HandError, applyEvent, initialState } from '../../core/engine/replay';
import type { CardStr, HandEvent, HandRecord } from '../../core/hand/types';
import { CardPicker } from '../cards/CardPicker';
import { Button } from '../controls';
import { notesBefore, withNote, withoutNote } from '../../core/ranges/handRanges';
import { rangesAt } from '../../core/motives/story';
import { ActionBar } from '../lab/ActionBar';
import { DecisionPanel } from '../lab/DecisionPanel';
import { useStory } from '../lab/useStory';
import { allCharts } from '../ranges/charts';
import { downloadJson, saveHand } from '../library';
import { SQUID_ICON } from '../playerTypes';
import { useSettings } from '../settings';
import { PokerTable } from '../table/PokerTable';
import { ActionList } from './ActionList';
import { PlaybackBar } from './PlaybackBar';
import { TableCenter } from './TableCenter';
import { actionRows, anchorSeat, moneyFor, replaySeatViews, resultSummary, safeSteps, streetSteps, type ListRow } from './views';

const STEP_MS = 1100;

interface Props {
  initial: HandRecord;
  /** Your own hands: the Lab (enter, rewind, branch, undo; saved on every change). Samples: replay only. */
  editable: boolean;
  onBack: () => void;
  onNewHand: () => void;
  onEditCopy?: (hand: HandRecord) => void;
}

const errorText = (e: unknown) => (e instanceof HandError ? e.message.replace(/^(Event \d+|Setup): /, '') : String(e));

export function HandScreen({ initial, editable, onBack, onNewHand, onEditCopy }: Props) {
  const { settings } = useSettings();
  const [hand, setHand] = useState(initial);
  const [undoStack, setUndoStack] = useState<{ hand: HandRecord; step: number }[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [cardsFor, setCardsFor] = useState<number | null>(null);

  const { steps, error } = useMemo(() => safeSteps(hand), [hand]);
  const last = steps.length - 1;
  const [step, setStep] = useState(editable ? last : 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const cursor = Math.min(step, last);

  const go = (s: number) => {
    setPlaying(false);
    setEditError(null);
    setStep(Math.max(0, Math.min(last, s)));
  };

  // ---- editing ----------------------------------------------------------------------------
  const commit = (next: HandRecord, nextStep: number) => {
    setUndoStack((u) => [...u.slice(-99), { hand, step: cursor }]);
    setHand(next);
    setStep(nextStep);
    setEditError(null);
    setPlaying(false);
    saveHand(next);
  };

  /** Enter an event at the cursor; anything after it is replaced (a branch). */
  const addEvent = (ev: HandEvent) => {
    try {
      applyEvent(steps[cursor]!, ev, cursor);
    } catch (e) {
      setEditError(errorText(e));
      return;
    }
    const events = [...hand.events.slice(0, cursor), ev];
    // ranges set further along the old branch don't belong to the new one
    commit(hand.ranges ? { ...hand, events, ranges: notesBefore(hand.ranges, cursor) } : { ...hand, events }, cursor + 1);
  };

  /** God mode: a player's range from this point on (null: back to the chart for their spot). */
  const setRange = (seat: number, range: string | null) => {
    const ranges = range === null ? withoutNote(hand.ranges, seat, cursor) : withNote(hand.ranges, { seat, fromEvent: cursor, range });
    commit({ ...hand, ranges }, cursor);
  };

  const undo = () => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    setUndoStack((u) => u.slice(0, -1));
    setHand(prev.hand);
    setStep(prev.step);
    setEditError(null);
    saveHand(prev.hand);
  };

  const setHoleCards = (seat: number, cards: CardStr[] | null) => {
    const next: HandRecord = {
      ...hand,
      players: hand.players.map((p) => (p.seat === seat ? { ...p, cards: cards ? [cards[0]!, cards[1]!] : undefined } : p)),
    };
    try {
      initialState(next);
      const check = safeSteps(next);
      if (check.error && !error) throw check.error;
    } catch (e) {
      setEditError(`Can't use those cards: ${errorText(e)}`);
      return;
    }
    commit(next, cursor);
  };

  // ---- playback ---------------------------------------------------------------------------
  useEffect(() => {
    if (!playing) return;
    if (cursor >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => Math.min(last, s + 1)), STEP_MS / speed);
    return () => clearTimeout(t);
  }, [playing, cursor, last, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (editable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'ArrowRight') go(cursor + 1);
      else if (e.key === 'ArrowLeft') go(cursor - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(last);
      else if (e.key === ' ') {
        e.preventDefault();
        if (cursor >= last) setStep(0);
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- view -------------------------------------------------------------------------------
  const money = useMemo(() => moneyFor(hand, settings.amounts), [hand, settings.amounts]);
  const charts = useMemo(allCharts, []);
  const story = useStory(hand, steps, charts);
  const rows = useMemo(() => actionRows(hand, steps[last]!, money), [hand, steps, last, money]);
  const streets = useMemo(() => streetSteps(steps), [steps]);
  const state = steps[cursor]!;
  const final = steps[last]!;
  const storyRanges = useMemo(
    () => (story.input && story.steps ? rangesAt(story.input, story.steps, cursor) : null),
    [story.input, story.steps, cursor],
  );

  // In the Lab a click goes to just before that line, so the next entry replaces it.
  const jump = (row: ListRow) => {
    if (editable) go(row.event >= 0 && Number.isFinite(row.event) ? row.event : 0);
    else if (row.step !== null) go(row.step);
  };

  const t = hand.table;
  const firstStraddle = hand.events.find((e) => e.type === 'straddle');
  const details = [
    `${t.seats}-max ${t.venue === 'home' ? 'home game' : 'casino'}`,
    `${money(t.blinds.sb)}/${money(t.blinds.bb)}`,
    t.ante ? `${t.ante.kind === 'bb' ? 'BB ante' : 'ante'} ${money(t.ante.amount)}` : null,
    t.rake ? `rake ${Math.round(t.rake.percent * 1000) / 10}%${t.rake.cap ? ` (cap ${money(t.rake.cap)})` : ''}` : null,
    t.name ?? null,
  ].filter(Boolean);
  const badges = [
    firstStraddle?.type === 'straddle' ? `Straddle ${money(firstStraddle.amount)}` : hand.houseRules?.straddle ? 'Straddles allowed' : null,
    hand.sideGames?.sevenDeuce ? `7-2 game ${money(hand.sideGames.sevenDeuce.bounty)}` : null,
    hand.sideGames?.squid ? `${SQUID_ICON} Squid ${money(hand.sideGames.squid.value)}` : null,
  ].filter(Boolean);

  const pickerTaken = (seat: number) =>
    new Set([...final.board, ...final.seats.filter((s) => s.seat !== seat && s.cards).flatMap((s) => s.cards!)]);
  const cardsPlayer = hand.players.find((p) => p.seat === cardsFor);

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
              {editable && <span className="ml-3 rounded bg-accent px-2 py-0.5 align-middle text-xs font-bold text-accent-ink">LAB</span>}
            </h1>
            <p className="text-sm text-muted">{details.join(' · ')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((b) => (
            <span key={b} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-ink">
              {b}
            </span>
          ))}
          {editable ? (
            <Button variant="secondary" disabled={undoStack.length === 0} onClick={undo} title="Undo (Ctrl+Z)">
              ↶ Undo
            </Button>
          ) : (
            onEditCopy && (
              <Button variant="primary" onClick={() => onEditCopy(hand)}>
                Edit a copy
              </Button>
            )
          )}
          <Button variant="secondary" onClick={() => downloadJson(`hand-${hand.handNo ?? hand.id}.json`, hand)}>
            Export JSON
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/50 bg-danger/10 px-4 py-2 text-sm text-danger">
          The replay stops at entry {(error.eventIndex ?? 0) + 1}: {errorText(error)}
        </div>
      )}
      {!editable && hand.events.length === 0 && (
        <div className="mb-4 rounded-md border border-line bg-surface px-4 py-2 text-sm text-muted">No actions entered yet.</div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface/60 p-2">
            <PokerTable
              size={t.seats}
              anchorSeat={anchorSeat(hand)}
              buttonSeat={hand.button}
              seats={replaySeatViews(hand, state, { money, showAllCards: settings.showAllCards || editable, isLastStep: cursor === last })}
              center={<TableCenter state={state} money={money} summary={cursor === last ? resultSummary(hand, state.result, money) : []} />}
              onSeatClick={editable ? setCardsFor : undefined}
            />
          </div>
          {editable && !error && (
            <ActionBar
              hand={hand}
              state={state}
              money={money}
              laterEvents={hand.events.length - cursor}
              error={editError}
              ranges={storyRanges}
              onEvent={addEvent}
              onNewHand={onNewHand}
            />
          )}
          {editable && (
            <p className="px-1 text-xs text-faint">
              Click a seat to set its hole cards. Click a line in the action list to go back to it. Undo: Ctrl+Z.
            </p>
          )}
          <PlaybackBar
            step={cursor}
            last={last}
            playing={playing}
            speed={speed}
            streets={streets}
            onStep={go}
            onTogglePlay={() => {
              if (cursor >= last) setStep(0);
              setPlaying((p) => !p);
            }}
            onSpeed={setSpeed}
          />
        </div>
        <div className="flex flex-col gap-3 xl:h-[calc(100vh-170px)] xl:max-h-[820px]">
          {!error && (
            <DecisionPanel hand={hand} state={state} step={cursor} editable={editable} money={money} charts={charts} story={story} onSetRange={setRange} onAction={editable ? addEvent : undefined} />
          )}
          <div className="min-h-[260px] flex-1">
            <ActionList rows={rows} step={cursor} atEnd={cursor === last} onJump={jump} />
          </div>
        </div>
      </div>

      {cardsPlayer && (
        <CardPicker
          title={`Hole cards for ${cardsPlayer.name}`}
          initial={cardsPlayer.cards ?? null}
          taken={pickerTaken(cardsPlayer.seat)}
          onClose={() => setCardsFor(null)}
          onDone={(cards) => {
            setCardsFor(null);
            setHoleCards(cardsPlayer.seat, cards);
          }}
        />
      )}
    </div>
  );
}
