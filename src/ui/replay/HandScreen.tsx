import { useEffect, useMemo, useState } from 'react';
import { HandError, applyEvent, initialState } from '../../core/engine/replay';
import type { CardStr, HandEvent, HandRecord } from '../../core/hand/types';
import { CardPicker } from '../cards/CardPicker';
import { Button } from '../controls';
import { notesBefore, withNote, withoutNote } from '../../core/ranges/handRanges';
import { cardsFromRange } from '../../core/motives/bot';
import { rangesAt, storyInput } from '../../core/motives/story';
import { ActionBar } from '../lab/ActionBar';
import { DecisionPanel } from '../lab/DecisionPanel';
import { RangeModal } from '../lab/RangeModal';
import { seatRange, SeatRangeSummary } from '../lab/SeatRange';
import { ask } from '../lab/useEquity';
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
/** A bot's pause before it acts when bots play the others, so you can follow the hand. */
const BOT_PAUSE_MS = 700;
const AUTO_BOTS_KEY = 'logistack.autoBots';

const pctText = (p: number) => `${Math.round(p * 100)}%`;

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
  const [rangeFor, setRangeFor] = useState<number | null>(null);
  const [botBusy, setBotBusy] = useState(false);
  const [botNote, setBotNote] = useState<string | null>(null);
  /** Every bot decision of this hand with its chances, by the step it was made at: shown when the hand is over. */
  const [botLog, setBotLog] = useState<{ step: number; text: string }[]>([]);
  const [autoBots, setAutoBotsState] = useState(() => {
    try {
      return localStorage.getItem(AUTO_BOTS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setAutoBots = (on: boolean) => {
    setAutoBotsState(on);
    try {
      localStorage.setItem(AUTO_BOTS_KEY, on ? '1' : '0');
    } catch {
      // storage blocked: the switch lasts for this screen only
    }
  };

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

  /**
   * The motive model acts for the player to act (after the flop). Without known cards it first
   * deals them a hand from their range at this point - what their actions so far allow - and the
   * cards and the action go in as one change (Undo takes both back).
   */
  const botPlay = async () => {
    const st = steps[cursor]!;
    const seat = st.toAct;
    if (botBusy || seat === null || st.phase !== 'betting' || st.board.length < 3) return;
    const s = st.seats.find((x) => x.seat === seat)!;
    let h = hand;
    if (!s.cards) {
      const w = storyRanges?.get(seat);
      const cards = w ? cardsFromRange(st, w) : null;
      if (!cards) {
        setEditError(w ? `No hand is left in ${s.name}'s range.` : 'Still narrowing the ranges, try again in a moment.');
        return;
      }
      h = { ...hand, players: hand.players.map((p) => (p.seat === seat ? { ...p, cards } : p)) };
    }
    const hs = safeSteps(h).steps;
    const input = storyInput(h, hs.slice(0, cursor + 1), charts);
    if (!input || !hs[cursor]) return;
    setBotBusy(true);
    const a = await ask({ kind: 'bot', input, state: hs[cursor]!, step: cursor });
    setBotBusy(false);
    if (!a.bot) {
      setEditError(a.error ?? 'The bot could not decide.');
      return;
    }
    const chosen = a.bot.options[a.bot.picked]!;
    const others = a.bot.options.filter((o, i) => i !== a.bot!.picked && o.p >= 0.01).map((o) => `${o.label} ${pctText(o.p)}`);
    const full = `${s.name}${s.cards ? '' : ' (dealt from their range)'}: ${chosen.label}, chance ${pctText(chosen.p)}${others.length ? ` · ${others.join(' · ')}` : ''}`;
    // while bots play, the chances would give their hand away: just the action until the hand is over
    setBotNote(autoBots ? `${s.name}: ${chosen.label}` : full);
    const street = st.board.length === 3 ? 'Flop' : st.board.length === 4 ? 'Turn' : 'River';
    setBotLog((log) => [...log.filter((x) => x.step < cursor), { step: cursor, text: `${street} · ${full}` }]);
    const events = [...h.events.slice(0, cursor), a.bot.event];
    commit(h.ranges ? { ...h, events, ranges: notesBefore(h.ranges, cursor) } : { ...h, events }, cursor + 1);
  };

  // Bots play the others: whenever it's someone else's turn after the flop, at the end of the hand.
  useEffect(() => {
    const st = steps[cursor]!;
    if (!autoBots || !editable || botBusy || cursor !== last || !story.steps) return;
    if (st.phase !== 'betting' || st.toAct === null || st.toAct === hand.hero || st.board.length < 3) return;
    const t = setTimeout(() => void botPlay(), BOT_PAUSE_MS);
    return () => clearTimeout(t);
  }, [autoBots, editable, botBusy, cursor, last, story.steps, hand]); // botPlay reads the same state

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

  /** A player's range at the cursor: the story's after the flop, the chart (or yours) before. */
  const seatRangeAt = (seat: number) => seatRange(hand, state, cursor, seat, charts, story, storyRanges);
  const rangeSeat = rangeFor !== null ? seatRangeAt(rangeFor) : null;
  // heads-up: the other player still in, for the fear map
  const otherLive = rangeSeat ? state.seats.filter((s) => s.dealtIn && !s.folded && s.seat !== rangeSeat.seat) : [];
  const rangeOpponent = otherLive.length === 1 ? (state.board.length >= 3 ? storyRanges?.get(otherLive[0]!.seat) : undefined) : undefined;

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
              seats={replaySeatViews(hand, state, {
                money,
                // while bots play the others, their cards stay hidden until the showdown, whatever Options say
                showAllCards: editable && autoBots ? false : settings.showAllCards || editable,
                isLastStep: cursor === last,
              })}
              center={<TableCenter state={state} money={money} summary={cursor === last ? resultSummary(hand, state.result, money) : []} />}
              onSeatClick={(seat) => seatRangeAt(seat) && setRangeFor(seat)}
              onCardsClick={editable ? setCardsFor : undefined}
              seatHover={(seat) => {
                const r = seatRangeAt(seat);
                return r ? <SeatRangeSummary r={r} board={state.board} editable={editable} /> : null;
              }}
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
              onBot={botPlay}
              botBusy={botBusy}
              botNote={botNote}
              onEvent={(ev) => {
                setBotNote(null);
                addEvent(ev);
              }}
              onNewHand={onNewHand}
            />
          )}
          {editable && cursor === last && (state.phase === 'showdown' || state.phase === 'complete') && botLog.some((x) => x.step < cursor) && (
            <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
              <div className="mb-1 text-xs font-bold tracking-wider text-muted uppercase">How the bots decided</div>
              <ul className="space-y-0.5 text-muted">
                {botLog
                  .filter((x) => x.step < cursor)
                  .map((x) => (
                    <li key={x.step}>🤖 {x.text}</li>
                  ))}
              </ul>
            </div>
          )}
          {editable && (
            <label className="flex w-fit cursor-pointer items-center gap-2 px-1 text-sm text-muted select-none">
              <input type="checkbox" checked={autoBots} onChange={(e) => setAutoBots(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              🤖 Bots play the others after the flop (dealing them cards from their range when unknown; their cards stay hidden)
            </label>
          )}
          {editable && (
            <p className="px-1 text-xs text-faint">
              Point at a player for their range, click for the whole of it; click their cards to set them. Click a line in the action list
              to go back to it. Undo: Ctrl+Z.
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
          {!error && autoBots && editable && state.phase === 'betting' && state.toAct !== null && state.toAct !== hand.hero && state.board.length >= 3 ? (
            <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
              🤖 {state.seats.find((s) => s.seat === state.toAct)?.name} is thinking…
            </div>
          ) : !error && (
            <DecisionPanel hand={hand} state={state} step={cursor} editable={editable} money={money} charts={charts} story={story} onSetRange={setRange} onAction={editable ? addEvent : undefined} />
          )}
          <div className="min-h-[260px] flex-1">
            <ActionList rows={rows} step={cursor} atEnd={cursor === last} onJump={jump} />
          </div>
        </div>
      </div>

      {rangeSeat && (
        <RangeModal
          title={`${rangeSeat.name} (${rangeSeat.position}${rangeSeat.playerType ? `, ${rangeSeat.playerType}` : ''}): range at this point`}
          seat={rangeSeat.seat}
          steps={story.steps ?? []}
          step={cursor}
          current={rangeSeat.weights}
          board={state.board}
          known={rangeSeat.known}
          opponent={rangeOpponent}
          note={rangeSeat.folded ? 'Folded - this was the range when they folded.' : rangeSeat.explanation}
          onClose={() => setRangeFor(null)}
        />
      )}

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
