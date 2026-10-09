import { useEffect, useMemo, useRef, useState } from 'react';
import { HandError, applyEvent, initialState, unknownCards } from '../../core/engine/replay';
import { cardToString } from '../../core/cards';
import type { CardStr, HandEvent, HandRecord } from '../../core/hand/types';
import type { TableState } from '../../core/engine/state';
import { CardPicker } from '../cards/CardPicker';
import { Button } from '../controls';
import { notesBefore, withNote, withoutNote } from '../../core/ranges/handRanges';
import { cardsFromRange, type BotChoice } from '../../core/motives/bot';
import { preflopChoice, randomHand } from '../../core/motives/preflop';
import { rangesAt, storyInput } from '../../core/motives/story';
import { AdvicePanel } from '../advice/AdvicePanel';
import { usePlaybook } from '../advice/usePlaybook';
import { matchAdvice } from '../../core/advice/playbook';
import { spotTags } from '../../core/advice/spot';
import { ActionBar } from '../lab/ActionBar';
import { DecisionPanel } from '../lab/DecisionPanel';
import { RangeModal } from '../lab/RangeModal';
import { seatRange, SeatRangeSummary } from '../lab/SeatRange';
import { ask } from '../lab/useEquity';
import { useStory } from '../lab/useStory';
import { allCharts } from '../ranges/charts';
import { addFishy } from '../fishy';
import { deleteHand, downloadJson, nextHandNo, saveHand } from '../library';
import { nextHand } from '../../core/hand/nextHand';
import { SQUID_ICON } from '../playerTypes';
import { useSettings } from '../settings';
import { FullScreenButton, useFullScreen } from '../table/FullScreen';
import { PokerTable, TABLE_HEIGHT } from '../table/PokerTable';
import { ActionList } from './ActionList';
import { BotLog } from './BotLog';
import { ICONS, PlaybackBar } from './PlaybackBar';
import { TableCenter } from './TableCenter';
import { WatchBar } from './WatchBar';
import { actionRows, anchorSeat, beforeHand, moneyFor, replaySeatViews, resultSummary, safeSteps, streetSteps, type ListRow } from './views';

const STEP_MS = 1100;
/** A bot's pause before it acts when bots play the others, so you can follow the hand. */
const BOT_PAUSE_MS = 700;
const AUTO_BOTS_KEY = 'logistack.autoBots';
/** Watching: the pause on a finished hand before the next one is dealt (at 1x). */
const NEXT_HAND_MS = 2500;
const WATCH_SPEEDS = [0.5, 1, 2, 4] as const;
const WATCH_SPEED_KEY = 'logistack.watchSpeed';
/** Pause lasts across hands: each new hand is a new screen. */
const watchSession = { paused: false };

const pctText = (p: number) => `${Math.round(p * 100)}%`;

interface Props {
  initial: HandRecord;
  /** Your own hands: the Lab (enter, rewind, branch, undo; saved on every change). Samples: replay only. */
  editable: boolean;
  onBack: () => void;
  /** The module "back" returns to: Lab, Gym, Live or Players. */
  backLabel?: string;
  onNewHand: () => void;
  /** The gym: the next hand at the same table, ready to play (the caller saves and opens it). */
  onNextHand?: (next: HandRecord) => void;
  onEditCopy?: (hand: HandRecord) => void;
}

const errorText = (e: unknown) => (e instanceof HandError ? e.message.replace(/^(Event \d+|Setup): /, '') : String(e));

export function HandScreen({ initial, editable, onBack, backLabel = 'Lab', onNewHand, onNextHand, onEditCopy }: Props) {
  const { settings } = useSettings();
  const { playbook } = usePlaybook();
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

  /** The gym's watch mode: bots play every seat, cards face up, the next hand comes by itself. */
  const watching = editable && !!hand.watch;
  const [watchSpeed, setWatchSpeedState] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(WATCH_SPEED_KEY));
      return (WATCH_SPEEDS as readonly number[]).includes(v) ? v : 1;
    } catch {
      return 1;
    }
  });
  const setWatchSpeed = (v: number) => {
    setWatchSpeedState(v);
    try {
      localStorage.setItem(WATCH_SPEED_KEY, String(v));
    } catch {
      // storage blocked: the speed lasts for this hand only
    }
  };
  const [paused, setPausedState] = useState(watchSession.paused);
  const setPaused = (on: boolean) => {
    watchSession.paused = on;
    setPausedState(on);
  };
  const { full, setFull, toggleFull } = useFullScreen();

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

  /** The hand is over (pot settled): the next one can be dealt. */
  const finalState = steps[last]!;
  const handOver = finalState.phase === 'complete' || (finalState.phase === 'showdown' && !!finalState.result?.resolved);
  /** The next hand, with the stacks as they are in `from`. */
  const dealFrom = (from: TableState) => {
    if (!onNextHand) return;
    const next = nextHand(hand, from, { id: crypto.randomUUID(), createdAt: new Date().toISOString(), handNo: nextHandNo() });
    // a watched hand nobody pinned makes room for the next one
    if (hand.watch && !hand.watch.keep) deleteHand(hand.id);
    onNextHand(next);
  };
  const dealNext = () => {
    if (handOver) dealFrom(finalState);
  };

  /** Watch mode on (this hand stays in your hands) or off (it becomes an ordinary Lab hand). */
  const setWatching = (on: boolean) => {
    const { watch: _watch, ...rest } = hand;
    void _watch;
    commit(on ? { ...hand, watch: { keep: true } } : rest, cursor);
  };
  const keepHand = () => commit({ ...hand, watch: { keep: true } }, cursor);

  /** Watching: the bots wait while paused, and while you are back in the hand. */
  const halted = paused || cursor < last;
  const togglePause = () => {
    if (!halted) return setPaused(true);
    if (cursor < last) go(last);
    setPaused(false);
  };
  /** Watching: the next hand now. A hand still running is dropped: the stacks stay as they were before it. */
  const nextHandNow = () => dealFrom(handOver ? finalState : beforeHand(hand, steps[0]!));

  /** A bot move that smells fishy: noted for calibration, and the hand is kept to replay it. */
  const markFishy = (step: number, move: string) => {
    if (watching) setPaused(true);
    const note = window.prompt(`What smells fishy about this move?\n\n${move}`, '');
    if (note === null) return;
    addFishy({ id: crypto.randomUUID(), at: new Date().toISOString(), handId: hand.id, handNo: hand.handNo, step, move, note });
    if (hand.watch && !hand.watch.keep) keepHand();
    else saveHand(hand);
    setFishyNote(`Noted 🐟 - it's in the "Smells fishy" list in the Gym.`);
  };
  const [fishyNote, setFishyNote] = useState<string | null>(null);

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
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      const key = e.key.toLowerCase();
      if (editable && (e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        undo();
      } else if (plain && key === 'f') toggleFull();
      else if (watching && plain && key === 'n' && onNextHand) nextHandNow();
      else if (editable && plain && key === 'n' && cursor === last && handOver) dealNext();
      else if (e.key === 'ArrowRight') go(cursor + 1);
      else if (e.key === 'ArrowLeft') go(cursor - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(last);
      else if (e.key === ' ') {
        e.preventDefault();
        // watching, Space is the bots' pause; otherwise it plays the replay
        if (watching) togglePause();
        else {
          if (cursor >= last) setStep(0);
          setPlaying((p) => !p);
        }
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
    if (botBusy || seat === null || st.phase !== 'betting') return;
    const preflop = st.board.length < 3;
    const s = st.seats.find((x) => x.seat === seat)!;
    let h = hand;
    if (!s.cards) {
      // before the flop: a random hand; after it: a hand from what its actions so far allow
      const w = preflop ? null : storyRanges?.get(seat);
      const cards = preflop ? randomHand(unknownCards(st)) : w ? cardsFromRange(st, w) : null;
      if (!cards) {
        setEditError(w ? `No hand is left in ${s.name}'s range.` : 'Still narrowing the ranges, try again in a moment.');
        return;
      }
      h = { ...hand, players: hand.players.map((p) => (p.seat === seat ? { ...p, cards } : p)) };
    }
    const hs = safeSteps(h).steps;
    if (!hs[cursor]) return;
    let choice: BotChoice;
    if (preflop) {
      choice = preflopChoice(hs[cursor]!, charts);
    } else {
      const input = storyInput(h, hs.slice(0, cursor + 1), charts);
      if (!input) return;
      setBotBusy(true);
      const a = await ask({ kind: 'bot', input, state: hs[cursor]!, step: cursor });
      setBotBusy(false);
      if (!a.bot) {
        setEditError(a.error ?? 'The bot could not decide.');
        return;
      }
      choice = a.bot;
    }
    const chosen = choice.options[choice.picked]!;
    const others = choice.options.filter((o, i) => i !== choice.picked && o.p >= 0.01).map((o) => `${o.label} ${pctText(o.p)}`);
    const dealt = s.cards ? '' : preflop ? ' (dealt a random hand)' : ' (dealt from their range)';
    const full = `${s.name}${dealt}: ${chosen.label}, chance ${pctText(chosen.p)}${others.length ? ` · ${others.join(' · ')}` : ''}`;
    // while bots play with hidden cards, the chances would give their hand away: just the action until the hand is over
    setBotNote(autoBots && !watching ? `${s.name}: ${chosen.label}` : full);
    const street = preflop ? 'Preflop' : st.board.length === 3 ? 'Flop' : st.board.length === 4 ? 'Turn' : 'River';
    // the coach's voice beside the bot's move: the playbook's top advice for that moment
    const tip = playbook ? matchAdvice(playbook.entries, spotTags(st, seat), 1)[0]?.entry.title : undefined;
    setBotLog((log) => [...log.filter((x) => x.step < cursor), { step: cursor, text: `${street} · ${full}${tip ? ` · HHP: ${tip}` : ''}` }]);
    const events = [...h.events.slice(0, cursor), choice.event];
    commit(h.ranges ? { ...h, events, ranges: notesBefore(h.ranges, cursor) } : { ...h, events }, cursor + 1);
  };

  const dealBoard = (st: TableState) => {
    const pool = unknownCards(st);
    const cards: string[] = [];
    for (let i = 0; i < st.needCards; i++) cards.push(cardToString(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!));
    addEvent({ type: 'board', cards });
  };

  /** Watching: everyone without cards gets a random hand at once, so you see them from the start. */
  const dealEveryone = (st: TableState) => {
    let pool = unknownCards(st);
    const players = hand.players.map((p) => {
      const s = st.seats.find((x) => x.seat === p.seat);
      if (!s?.dealtIn || s.folded || s.cards) return p;
      const cards = randomHand(pool);
      pool = pool.filter((c) => cardToString(c) !== cards[0] && cardToString(c) !== cards[1]);
      return { ...p, cards };
    });
    commit({ ...hand, players }, cursor);
  };

  /**
   * What the bots do next by themselves: deal the cards or the board, act for the player to act
   * (after the flop once the ranges are narrowed) or, watching, deal the next hand. Null: Hero's
   * turn (unless watching), or nothing to do.
   */
  const autoMove = (): (() => void) | null => {
    const st = steps[cursor]!;
    if (!editable || error || cursor !== last) return null;
    if (watching && handOver) return onNextHand ? dealNext : null;
    if (watching && st.phase === 'betting' && st.seats.some((s) => s.dealtIn && !s.folded && !s.cards)) return () => dealEveryone(st);
    if (st.phase === 'dealing') return () => dealBoard(st);
    if (st.phase !== 'betting' || st.toAct === null || (!watching && st.toAct === hand.hero)) return null;
    if (st.board.length >= 3 && !story.steps) return null;
    return () => void botPlay();
  };

  // Bots play the others (or, watching, everyone): a short pause before each move so you can follow.
  useEffect(() => {
    if (!(autoBots || watching) || botBusy || (watching && paused)) return;
    const move = autoMove();
    if (!move) return;
    const t = setTimeout(move, (watching && handOver ? NEXT_HAND_MS : BOT_PAUSE_MS) / (watching ? watchSpeed : 1));
    return () => clearTimeout(t);
  }, [autoBots, watching, paused, watchSpeed, editable, botBusy, cursor, last, story.steps, hand]); // autoMove reads the same state

  // Watching, the pause button follows you down the page once the control bar is out of sight.
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barSeen, setBarSeen] = useState(true);
  useEffect(() => {
    const el = barRef.current;
    if (!el || !watching || full || typeof IntersectionObserver === 'undefined') return;
    // the app's menu bar covers the top of the page
    const io = new IntersectionObserver(([e]) => setBarSeen(!!e?.isIntersecting), { rootMargin: '-96px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [watching, full]);
  const canStep = cursor < last || (paused && !botBusy && !!autoMove());
  const stepOnce = () => (cursor < last ? go(cursor + 1) : autoMove()?.());

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

  // HHP's advice for the player to act - not while the bots play on by themselves
  const adviceSeat =
    !error && state.phase === 'betting' && state.toAct !== null && !(watching && !halted) && !(autoBots && !watching && state.toAct !== hand.hero)
      ? state.toAct
      : null;

  const pickerTaken = (seat: number) =>
    new Set([...final.board, ...final.seats.filter((s) => s.seat !== seat && s.cards).flatMap((s) => s.cards!)]);
  const cardsPlayer = hand.players.find((p) => p.seat === cardsFor);

  const table = (
    <PokerTable
      size={t.seats}
      anchorSeat={anchorSeat(hand)}
      buttonSeat={hand.button}
      seats={replaySeatViews(hand, state, {
        money,
        // while bots play the others, their cards stay hidden until the showdown, whatever Options say;
        // watching, everything is face up
        showAllCards: editable && autoBots && !watching ? false : settings.showAllCards || editable,
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
  );

  // The one control bar: the bots' pause, speed, next hand and stop while watching; the replay otherwise.
  const controlBar = watching ? (
    <WatchBar
      halted={halted}
      onTogglePause={togglePause}
      onStep={stepOnce}
      canStep={canStep}
      speed={watchSpeed}
      speeds={WATCH_SPEEDS}
      onSpeed={setWatchSpeed}
      onNextHand={onNextHand ? nextHandNow : undefined}
      onStop={onBack}
      stopTitle={`Stop watching: back to the ${backLabel}`}
    />
  ) : (
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
      onNextHand={editable && onNextHand ? dealNext : undefined}
      nextReady={handOver}
      onStop={full ? onBack : undefined}
      stopTitle={`Back to the ${backLabel}`}
      compact={full}
    />
  );

  const actionBar = editable && !error && (
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
      onNextHand={onNextHand ? dealNext : undefined}
      compact={full}
    />
  );

  const modals = (
    <>
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
    </>
  );

  // Full screen: the table as big as the screen allows, the controls along the bottom edge.
  if (full) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col bg-bg" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="relative min-h-0 flex-1" style={{ containerType: 'size' }}>
            <div className="absolute inset-0 flex items-center justify-center">
              {/* as wide as the screen, unless its height runs out first */}
              <div style={{ width: `min(100cqw, ${(100 / TABLE_HEIGHT).toFixed(1)}cqh)` }}>{table}</div>
            </div>
            <div className="pointer-events-none absolute top-2 left-3 max-w-[40%] truncate text-xs text-muted">
              {hand.handNo !== undefined && `#${hand.handNo} `}
              {hand.title || t.name || 'Hand'}
            </div>
            <FullScreenButton full onClick={() => setFull(false)} className="absolute top-2 right-2" />
            <p className="pointer-events-none absolute inset-x-0 bottom-3 hidden text-center text-xs text-faint max-sm:portrait:block">
              Turn the phone sideways for a bigger table.
            </p>
          </div>
          {/* a played hand: your buttons, in a box of fixed height so the table never jumps (one row on a
              wide screen, three on a phone held upright; it scrolls if a hand needs more) */}
          {actionBar && !watching && <div className="h-44 shrink-0 overflow-y-auto px-2 pb-1 sm:h-[7.5rem] md:h-[4.5rem]">{actionBar}</div>}
          <div className="shrink-0 px-2 pb-2">{controlBar}</div>
        </div>
        {modals}
      </>
    );
  }

  const logEntries = botLog.filter((x) => x.step < cursor);
  // playing against them, the chances would give the bots' hands away: shown once the hand is over
  const showLog = editable && logEntries.length > 0 && (watching || (cursor === last && (state.phase === 'showdown' || state.phase === 'complete')));

  return (
    <div className="mx-auto max-w-[1500px] px-2 py-3 sm:px-6 sm:py-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 sm:mb-4">
        <div className="flex items-start gap-2 sm:gap-4">
          <Button variant="ghost" onClick={onBack}>
            ← {backLabel}
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
          {watching &&
            (hand.watch?.keep ? (
              <span className="px-1 text-xs text-muted">📌 Kept in your hands</span>
            ) : (
              <Button variant="ghost" onClick={keepHand} title="Watched hands make room for the next one; a kept hand stays in your hands">
                📌 Keep this hand
              </Button>
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
        {/* The table, then the control bar right under it: nothing above the bar changes height when a
            bot acts, so it never moves. Everything that grows or comes and goes is below it. */}
        <div className="space-y-3">
          <div className="relative rounded-lg border border-line bg-surface/60 p-1 sm:p-2">
            {table}
            <FullScreenButton full={false} onClick={() => setFull(true)} className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5" />
          </div>
          <div ref={barRef}>{controlBar}</div>
          {watching && paused && (
            <p className="px-1 text-xs text-faint">Paused: the Decision panel shows how the player to act sees the spot.</p>
          )}
          {actionBar}
          {editable && (
            <div className="flex flex-col gap-1 px-1 text-sm text-muted">
              {!watching && (
                <label className="flex w-fit cursor-pointer items-center gap-2 select-none">
                  <input type="checkbox" checked={autoBots} onChange={(e) => setAutoBots(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                  🤖 Bots play the others and deal the board (bots get cards when unknown - after the flop from their range - and keep them hidden)
                </label>
              )}
              <label className="flex w-fit cursor-pointer items-center gap-2 select-none">
                <input type="checkbox" checked={watching} onChange={(e) => setWatching(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                👀 Watch: bots play every seat with their cards face up, and the next hand comes by itself
              </label>
            </div>
          )}
          {editable && (
            <p className="px-1 text-xs text-faint">
              Point at a player for their range, click for the whole of it; click their cards to set them. Click a line in the action list
              to go back to it. Undo: Ctrl+Z. Full screen: F.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 xl:h-[calc(100vh-170px)] xl:max-h-[820px]">
          {!error && editable && state.phase === 'betting' && state.toAct !== null && ((autoBots && !watching && state.toAct !== hand.hero) || (watching && !halted)) ? (
            <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
              🤖 {state.seats.find((s) => s.seat === state.toAct)?.name} is thinking…
            </div>
          ) : !error && (
            <DecisionPanel hand={hand} state={state} step={cursor} editable={editable} money={money} charts={charts} story={story} onSetRange={setRange} onAction={editable ? addEvent : undefined} />
          )}
          {adviceSeat !== null && (
            <div className="max-h-[45vh] shrink-0 overflow-auto">
              <AdvicePanel state={state} seat={adviceSeat} />
            </div>
          )}
          <div className="min-h-[260px] flex-1">
            <ActionList rows={rows} step={cursor} atEnd={cursor === last} onJump={jump} />
          </div>
        </div>
      </div>

      {/* the bots' decisions at the bottom of the page, newest first */}
      {showLog && (
        <div className="mt-4">
          <BotLog entries={logEntries} fishyNote={fishyNote} onFishy={markFishy} />
        </div>
      )}

      {/* watching, with the control bar scrolled out of sight: the pause button stays at hand (and the
          room under the page lets the last lines scroll clear of it) */}
      {watching && <div className="h-20" aria-hidden />}
      {watching && !barSeen && (
        <button
          type="button"
          onClick={togglePause}
          title={halted ? 'Go on (Space)' : 'Pause (Space)'}
          aria-label={halted ? 'Go on' : 'Pause'}
          className="fixed right-4 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-ink shadow-xl transition-colors hover:bg-accent-strong"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
            <path d={halted ? ICONS.play : ICONS.pause} />
          </svg>
        </button>
      )}

      {modals}
    </div>
  );
}
