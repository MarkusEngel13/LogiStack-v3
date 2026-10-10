import { useMemo, useState } from 'react';
import { legalActions, potOdds, potTotal } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import type { HandEvent, HandRecord, SeatNo } from '../../core/hand/types';
import { profileFor } from '../../core/motives/profile';
import type { SizeQuestion, SizeRow } from '../../core/motives/sizes';
import { fingerprint, postflopOrder, rangesAt, situationOf } from '../../core/motives/story';
import { playerRange } from '../../core/ranges/handRanges';
import { comboTotal, withoutCards, type Weights } from '../../core/ranges/range';
import type { ChartChoice } from '../../core/ranges/spot';
import { PlayingCard } from '../cards/PlayingCard';
import type { Money } from '../replay/views';
import { EvTable } from './EvTable';
import { RangeModal } from './RangeModal';
import { OptionsPanel } from './OptionsPanel';
import { SpotLine } from './SpotLine';
import { BucketBar, RangeStory } from './RangeStory';
import { useEquity } from './useEquity';
import type { StoryView } from './useStory';
import { VillainRangeModal } from './VillainRangeModal';

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const combosText = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')} combos`;

/**
 * The player to act against the ranges of everyone still in: equity, the pot odds they need,
 * call or fold, and what calling is worth. After the flop the ranges are the hand's range story:
 * narrowed at every action by the fear-and-greed model (heads-up). In the Lab each range can be
 * repainted (god mode).
 */
export function DecisionPanel({
  hand,
  state,
  step,
  editable,
  money,
  charts,
  story,
  onSetRange,
  onAction,
}: {
  hand: HandRecord;
  state: TableState;
  step: number;
  editable: boolean;
  money: Money;
  charts: readonly ChartChoice[];
  story: StoryView;
  /** A range text for this player from this step on, or null to go back to the chart. */
  onSetRange: (seat: SeatNo, range: string | null) => void;
  /** The Lab: enter an action (the size explorer's "Bet" buttons). */
  onAction?: (ev: HandEvent) => void;
}) {
  const [editing, setEditing] = useState<SeatNo | null>(null);
  const [viewing, setViewing] = useState<SeatNo | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const me = state.phase === 'betting' && state.toAct !== null ? state.seats.find((s) => s.seat === state.toAct) : undefined;
  // Opponents are the players who have put chips in by choice; those still to act (who mostly
  // fold) are left out rather than counted as random hands.
  const acted = new Set(state.log.flatMap((e) => (e.kind === 'action' && e.action !== 'fold' ? [e.seat] : [])));
  const live = me ? state.seats.filter((s) => s.dealtIn && !s.folded && s.seat !== me.seat) : [];
  const opponents = live.filter((s) => acted.has(s.seat));
  const waiting = live.filter((s) => !acted.has(s.seat));

  // After the flop: the ranges at this step of the story (start range, your resets, narrowings).
  const postflop = state.board.length >= 3;
  const inStory = postflop && story.input !== null;
  const narrowed = useMemo(
    () => (inStory && story.input && story.steps ? rangesAt(story.input, story.steps, step) : null),
    [inStory, story.input, story.steps, step],
  );
  const narrowing = inStory && !story.steps && !story.error;

  // opponents come from state, so these four cover it
  const base = useMemo(() => opponents.map((o) => playerRange(hand, state, step, o.seat, charts)), [hand, state, step, charts]);
  const ranges = base.map((r) => {
    const w = narrowed?.get(r.seat);
    return w ? { ...r, weights: w, narrowed: true } : { ...r, narrowed: false };
  });
  const dead = me?.cards ? [...me.cards, ...state.board] : [...state.board];
  const question =
    me?.cards && ranges.length > 0 && !narrowing
      ? { kind: 'hero' as const, hero: me.cards, board: state.board, villains: ranges.map((r) => r.weights) }
      : null;
  const key = JSON.stringify([me?.cards, state.board, ranges.map((r) => fingerprint(r.weights))]);
  const { answer, pending } = useEquity(question, key);
  const myLine = me ? narrowed?.get(me.seat) : undefined;
  // the ranges as one player sees the others' (their range reading), for the size explorer and the lines
  const seenBy = (observer: SeatNo) => (inStory && story.input && story.steps ? rangesAt(story.input, story.steps, step, { observer }) : null);

  if (!me) return null;

  const legal = legalActions(state);
  // Everyone else still in, in the order they act after the player to act, with the ranges as the
  // model has them and as each one sees the others: for the EV table, the size explorer and the lines.
  const myOrder = postflopOrder(state, me.seat);
  const n = state.rules.tableSeats;
  const after = (seat: SeatNo) => (postflopOrder(state, seat) - myOrder + n) % n;
  const sizeQ: SizeQuestion | null = (() => {
    if (!legal || !myLine || !story.steps || !narrowed || live.length === 0 || live.some((s) => !narrowed.get(s.seat))) return null;
    const lastToAct = Math.max(...[me, ...live].map((s) => postflopOrder(state, s.seat)));
    const others = [...live].sort((x, y) => after(x.seat) - after(y.seat));
    const mine = seenBy(me.seat);
    return {
      situation: situationOf(state, me.seat).situation,
      actor: { profile: profileFor(me), range: myLine, cards: me.cards ?? undefined, streetBet: me.streetBet },
      others: others.map((o) => {
        const view = seenBy(o.seat);
        const seesOthers: Record<number, Weights> = {};
        for (const x of others) {
          const w = x.seat !== o.seat ? view?.get(x.seat) : undefined;
          if (w) seesOthers[x.seat] = w;
        }
        return {
          seat: o.seat,
          profile: profileFor(o),
          range: narrowed.get(o.seat)!,
          seen: mine?.get(o.seat),
          seesActor: view?.get(me.seat),
          seesOthers,
          streetBet: o.streetBet,
          stack: o.stack,
          inPosition: postflopOrder(state, o.seat) === lastToAct,
          after: postflopOrder(state, o.seat) > myOrder,
        };
      }),
    };
  })();
  const names: Record<number, string> = Object.fromEntries(live.map((s) => [s.seat, s.name]));
  /** The spot for a window's title: this player against everyone else still in. */
  const spotOf = (seat: SeatNo) => (
    <SpotLine state={state} me={seat} others={[me, ...live].map((s) => s.seat).filter((s) => s !== seat)} hero={hand.hero} money={money} />
  );
  const villain = sizeQ?.others.length === 1 ? state.seats.find((s) => s.seat === sizeQ.others[0]!.seat) : undefined;
  const canExplore = !!sizeQ && !!(legal!.canBet || legal!.canRaise);
  const canWhatIf = !!villain && (state.board.length === 3 || state.board.length === 4);
  // the EV table works itself out heads-up and on the turn and river; a multiway flop takes seconds, so on a click
  const evAuto = !!sizeQ && (sizeQ.others.length === 1 || state.board.length >= 4);
  /** Play an option in the Lab (the EV table's and the size explorer's buttons). */
  const play = (r: SizeRow) => {
    if (!onAction) return;
    const seat = me.seat;
    if (r.kind === 'fold' || r.kind === 'check' || r.kind === 'call') onAction({ type: 'action', seat, action: r.kind });
    else if (r.allIn) onAction({ type: 'action', seat, action: 'allin' });
    else onAction({ type: 'action', seat, action: r.kind, to: r.kind === 'bet' ? r.amount : me.streetBet + r.amount });
  };
  const odds = potOdds(state);
  const toCall = legal?.toCall ?? 0;
  const equity = answer?.equity;
  const ev = equity !== undefined && odds ? equity * (odds.pot + toCall) - toCall : undefined;
  const needed = odds ? odds.percent / 100 : 0;

  const verdict =
    equity === undefined || Number.isNaN(equity)
      ? null
      : toCall === 0
        ? { text: 'No bet to call', tone: 'var(--surface-3)', fg: 'var(--text)' }
        : ev! > 0
          ? { text: `Call · EV +${money(Math.round(ev!))}`, tone: '#1f8a4c', fg: '#fff' }
          : { text: `Fold · calling loses ${money(Math.round(-ev!))}`, tone: '#c62828', fg: '#fff' };

  const editedRange = editing !== null ? ranges.find((r) => r.seat === editing) : undefined;
  const editedSeat = editing !== null ? state.seats.find((s) => s.seat === editing) : undefined;

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-xs font-bold tracking-wider text-muted uppercase">Decision</span>
        <span className="flex items-center gap-2 text-sm">
          {me.name}
          <span className="text-muted">{me.position}</span>
          {me.cards && (
            <span className="flex gap-0.5">
              {me.cards.map((c) => (
                <PlayingCard key={c} card={c} width="20px" mini />
              ))}
            </span>
          )}
        </span>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        {!me.cards ? (
          <p className="text-sm text-muted">{editable ? `Click ${me.name}'s seat to set the hole cards and see the equity.` : `${me.name}'s cards are unknown.`}</p>
        ) : ranges.length === 0 ? (
          <p className="text-sm text-muted">Nobody has put chips in yet, so there is no range to play against.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted">Equity</span>
              <span className="text-2xl font-bold tabular-nums">
                {(pending || narrowing) && !answer ? '…' : equity !== undefined && !Number.isNaN(equity) ? pct(equity) : '–'}
                {answer?.stdError !== undefined && <span className="ml-1 text-xs font-normal text-muted">±{pct(2 * answer.stdError)}</span>}
              </span>
            </div>
            {toCall > 0 && odds && (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted">
                  To call {money(toCall)} into {money(odds.pot)}
                </span>
                <span className="tabular-nums">needs {pct(needed)}</span>
              </div>
            )}
            {sizeQ ? (
              <EvTable q={sizeQ} money={money} names={names} auto={evAuto} onUse={onAction ? play : undefined} />
            ) : (
              verdict && (
                <div className="rounded-md px-3 py-1.5 text-center text-sm font-bold" style={{ background: verdict.tone, color: verdict.fg }}>
                  {verdict.text}
                </div>
              )
            )}
            {sizeQ && (
              <button
                type="button"
                onClick={() => setOptionsOpen(true)}
                className="w-full rounded-md border border-line px-2 py-1.5 text-sm text-muted hover:border-accent hover:text-ink"
                title="Every option up close: the EV and whether it holds, how they answer each size, what reaches the next street"
              >
                Options up close…{' '}
                <span className="text-xs text-faint">
                  EV{canExplore ? ' · how they answer' : ''}
                  {canWhatIf ? ' · next street' : ''}
                </span>
              </button>
            )}
            {answer?.error && <p className="text-xs text-danger">{answer.error}</p>}
            <p className="text-xs text-faint">
              {answer?.method === 'monte-carlo'
                ? 'Simulated (60,000 deals, several opponents). '
                : answer?.method
                  ? 'Exact. '
                  : ''}
              {sizeQ ? `Pot ${money(potTotal(state))}.` : toCall > 0 ? 'EV assumes the hand is checked down from here.' : `Pot ${money(potTotal(state))}.`}
            </p>
          </>
        )}
      </div>

      <div className="space-y-2 border-t border-line px-4 py-3">
        {ranges.map((r) => {
          const o = state.seats.find((s) => s.seat === r.seat)!;
          const live = comboTotal(withoutCards(r.weights, dead));
          const actions = story.steps?.filter((s) => s.seat === r.seat && s.event < step && !s.skipped).length ?? 0;
          return (
            <div key={r.seat} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{o.name}</span>
                <span className="text-xs text-muted">{o.position}</span>
                <span className="ml-auto text-xs text-muted">{combosText(live)}</span>
                {r.narrowed && story.steps && (
                  <button
                    type="button"
                    onClick={() => setViewing(r.seat)}
                    title="The range up close: the 13x13 with what each action took out, why, and the fear of the next card"
                    className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:text-ink"
                  >
                    View
                  </button>
                )}
                {editable && (
                  <button type="button" onClick={() => setEditing(r.seat)} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:text-ink">
                    Edit
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-snug text-faint">
                {r.note ? (
                  <span className="text-accent-strong">Your range{r.note.fromEvent < step ? ' (set earlier in the hand)' : ''}.</span>
                ) : (
                  r.explanation
                )}
                {r.narrowed && actions > 0 && ` Then narrowed by ${actions === 1 ? 'its action' : `its ${actions} actions`} after the flop:`}
              </p>
              {r.narrowed && (
                <div className="mt-1.5">
                  <BucketBar weights={withoutCards(r.weights, dead)} board={state.board} />
                  {story.steps && <RangeStory seat={r.seat} steps={story.steps} step={step} known={me.cards ?? []} />}
                </div>
              )}
            </div>
          );
        })}
        {myLine && story.steps?.some((s) => s.seat === me.seat && s.event < step) && (
          <div className="border-t border-line pt-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{me.name}'s line</span>
              <span className="text-xs text-muted">what it tells the others</span>
              <span className="ml-auto text-xs text-muted">{combosText(comboTotal(withoutCards(myLine, state.board)))}</span>
              <button type="button" onClick={() => setViewing(me.seat)} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:text-ink">
                View
              </button>
            </div>
            <div className="mt-1.5">
              <BucketBar weights={withoutCards(myLine, state.board)} board={state.board} />
              <RangeStory seat={me.seat} steps={story.steps} step={step} known={[]} />
            </div>
          </div>
        )}
        {waiting.length > 0 && (
          <p className="text-xs leading-snug text-faint">
            Still to act, left out: {waiting.map((s) => s.name).join(', ')}.
          </p>
        )}
        {inStory && (
          <p className="border-t border-line pt-2 text-xs leading-snug text-faint">
            {narrowing ? (
              'Narrowing the ranges with the fear-and-greed model…'
            ) : story.error ? (
              <span className="text-danger">Range story failed ({story.error}); these are the preflop ranges.</span>
            ) : (
              <>
                After the flop each action keeps the hands that would take it, by the fear-and-greed model (player type and status from
                the wizard; multiway against everyone still in). Click an action to see which hands took it.{editable ? ' Edit overrides a range from here on.' : ''}
              </>
            )}
          </p>
        )}
      </div>

      {optionsOpen && sizeQ && (
        <OptionsPanel
          title={`Options · ${me.seat === hand.hero ? 'you' : me.name}`}
          spot={spotOf(me.seat)}
          q={sizeQ}
          money={money}
          names={names}
          canAnswers={canExplore}
          whatIf={canWhatIf && villain ? { otherName: villain.name, actorName: me.seat === hand.hero ? 'You' : me.name } : undefined}
          onUse={
            onAction
              ? (r) => {
                  setOptionsOpen(false);
                  play(r);
                }
              : undefined
          }
          onClose={() => setOptionsOpen(false)}
        />
      )}

      {viewing !== null && narrowed?.get(viewing) && story.steps && (
        <RangeModal
          title={viewing === me.seat ? `${me.name}'s line` : `${state.seats.find((s) => s.seat === viewing)?.name ?? 'Player'}'s range`}
          spot={spotOf(viewing)}
          seat={viewing}
          steps={story.steps}
          step={step}
          current={narrowed.get(viewing)!}
          board={state.board}
          known={viewing === me.seat ? [] : (me.cards ?? [])}
          opponent={ranges.length === 1 ? (viewing === me.seat ? ranges[0]!.weights : myLine) : undefined}
          onClose={() => setViewing(null)}
        />
      )}

      {editedRange && editedSeat && (
        <VillainRangeModal
          title={`Edit ${editedSeat.name}'s range`}
          spot={spotOf(editedSeat.seat)}
          initial={editedRange.weights}
          dead={dead}
          charts={charts}
          canReset={editedRange.note?.fromEvent === step}
          onSave={(text) => {
            onSetRange(editedSeat.seat, text);
            setEditing(null);
          }}
          onReset={() => {
            onSetRange(editedSeat.seat, null);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
