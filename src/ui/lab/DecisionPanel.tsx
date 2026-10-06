import { useMemo, useState } from 'react';
import { legalActions, potOdds, potTotal } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import type { HandEvent, HandRecord, SeatNo } from '../../core/hand/types';
import { profileFor } from '../../core/motives/profile';
import { fingerprint, rangesAt, situationOf } from '../../core/motives/story';
import { playerRange } from '../../core/ranges/handRanges';
import { comboTotal, withoutCards } from '../../core/ranges/range';
import type { ChartChoice } from '../../core/ranges/spot';
import { PlayingCard } from '../cards/PlayingCard';
import type { Money } from '../replay/views';
import { RangeModal } from './RangeModal';
import { SizeExplorer } from './SizeExplorer';
import { WhatIfModal } from './WhatIfModal';
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
  const [exploring, setExploring] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
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
  const villain = ranges.length === 1 ? state.seats.find((s) => s.seat === ranges[0]!.seat) : undefined;
  const heads = !!(legal && villain && myLine && narrowed?.get(villain.seat) && story.steps);
  const canExplore = heads && !!(legal!.canBet || legal!.canRaise);
  const canWhatIf = heads && (state.board.length === 3 || state.board.length === 4);
  // me, the villain and both ranges as the model has them and as each sees the other's
  const sizeQ =
    heads && villain
      ? {
          situation: situationOf(state, me.seat).situation,
          actor: { profile: profileFor(me), range: myLine!, seen: seenBy(villain.seat)?.get(me.seat), cards: me.cards ?? undefined },
          other: { profile: profileFor(villain), range: narrowed!.get(villain.seat)!, seen: seenBy(me.seat)?.get(villain.seat) },
        }
      : null;
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
            {verdict && (
              <div className="rounded-md px-3 py-1.5 text-center text-sm font-bold" style={{ background: verdict.tone, color: verdict.fg }}>
                {verdict.text}
              </div>
            )}
            {(canExplore || canWhatIf) && (
              <div className="flex gap-2">
                {canExplore && (
                  <button
                    type="button"
                    onClick={() => setExploring(true)}
                    className="flex-1 rounded-md border border-line px-2 py-1.5 text-sm text-muted hover:border-accent hover:text-ink"
                    title="Every bet size against their range: who folds, calls or raises, bucket by bucket, and your EV"
                  >
                    Explore bet sizes…
                  </button>
                )}
                {canWhatIf && (
                  <button
                    type="button"
                    onClick={() => setWhatIfOpen(true)}
                    className="flex-1 rounded-md border border-line px-2 py-1.5 text-sm text-muted hover:border-accent hover:text-ink"
                    title="Check, bet small or bet big: what reaches the next street, on a blank or a scare card"
                  >
                    What happens if…
                  </button>
                )}
              </div>
            )}
            {answer?.error && <p className="text-xs text-danger">{answer.error}</p>}
            <p className="text-xs text-faint">
              {answer?.method === 'monte-carlo'
                ? 'Simulated (60,000 deals, several opponents). '
                : answer?.method
                  ? 'Exact. '
                  : ''}
              {toCall > 0 ? 'EV assumes the hand is checked down from here.' : `Pot ${money(potTotal(state))}. Bet and raise EV come next.`}
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

      {whatIfOpen && canWhatIf && villain && sizeQ && (
        <WhatIfModal
          title={`${me.name} (${me.position}) against ${villain.name} (${villain.position}${villain.playerType ? `, ${villain.playerType}` : ''}): what happens if…`}
          otherName={villain.name}
          money={money}
          q={sizeQ}
          onClose={() => setWhatIfOpen(false)}
        />
      )}

      {exploring && canExplore && villain && sizeQ && (
        <SizeExplorer
          title={`${me.name} (${me.position}): bet sizes against ${villain.name} (${villain.position}${villain.playerType ? `, ${villain.playerType}` : ''})`}
          otherName={villain.name}
          money={money}
          q={sizeQ}
          onUse={
            onAction
              ? (r) => {
                  setExploring(false);
                  onAction(
                    r.allIn
                      ? { type: 'action', seat: me.seat, action: 'allin' }
                      : { type: 'action', seat: me.seat, action: r.kind === 'bet' ? 'bet' : 'raise', to: r.kind === 'bet' ? r.amount : me.streetBet + r.amount },
                  );
                }
              : undefined
          }
          onClose={() => setExploring(false)}
        />
      )}

      {viewing !== null && narrowed?.get(viewing) && story.steps && (
        <RangeModal
          title={`${state.seats.find((s) => s.seat === viewing)?.name ?? 'Player'}: ${viewing === me.seat ? 'the range your line shows' : 'range at this point'}`}
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
          title={`${editedSeat.name} (${editedSeat.position}): range at this point`}
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
