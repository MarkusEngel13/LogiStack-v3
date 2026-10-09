import { rangeBuckets } from '../../core/buckets';
import type { Card } from '../../core/cards';
import type { TableState } from '../../core/engine/state';
import type { HandRecord, SeatNo } from '../../core/hand/types';
import type { StoryStep } from '../../core/motives/story';
import { playerRange } from '../../core/ranges/handRanges';
import { comboTotal, withoutCards, type Weights } from '../../core/ranges/range';
import type { ChartChoice } from '../../core/ranges/spot';
import { statusIcon } from '../playerTypes';
import { styleSummary } from '../players/SavedPlayerPicker';
import type { SeatStyle } from '../../core/players/style';
import { streetName } from '../replay/views';
import { BucketBar, combosText } from './RangeStory';
import type { StoryView } from './useStory';

/** A player's range at a step of the hand, with what the screen says about it. */
export interface SeatRange {
  seat: SeatNo;
  name: string;
  position: string;
  playerType?: string;
  /** A saved player or profile from the Players page. */
  style?: SeatStyle;
  tags: readonly string[];
  folded: boolean;
  weights: Weights;
  /** Narrowed after the flop by the range story. */
  narrowed: boolean;
  /** Where the range comes from: the chart for the preflop spot, or your range. */
  explanation: string;
  /** Known cards of the other players (Hero's): they can't be in this range. */
  known: Card[];
  /** Their actions after the flop so far, the latest last. */
  steps: StoryStep[];
}

/** The range of `seat` at `step`: the story's narrowed range after the flop, the chart (or yours) before. */
export function seatRange(
  hand: HandRecord,
  state: TableState,
  step: number,
  seat: SeatNo,
  charts: readonly ChartChoice[],
  story: StoryView,
  narrowed: Map<SeatNo, Weights> | null,
): SeatRange | null {
  const s = state.seats.find((x) => x.seat === seat);
  if (!s || !s.dealtIn) return null;
  const base = playerRange(hand, state, step, seat, charts);
  const w = state.board.length >= 3 ? narrowed?.get(seat) : undefined;
  const others = state.seats.filter((x) => x.seat !== seat && x.cards && (x.seat === hand.hero || x.shown));
  return {
    seat,
    name: s.name,
    position: s.position,
    playerType: s.playerType,
    style: s.style,
    tags: s.tags,
    folded: s.folded,
    weights: w ?? base.weights,
    narrowed: !!w,
    explanation: base.note ? 'Your range for this player.' : base.explanation,
    known: others.flatMap((x) => x.cards!),
    steps: story.steps?.filter((x) => x.seat === seat && x.event < step && !x.skipped) ?? [],
  };
}

const pct = (x: number) => (Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);

/** The hover card on a seat: combos, buckets, where the range comes from and its last action. */
export function SeatRangeSummary({ r, board, editable }: { r: SeatRange; board: Card[]; editable: boolean }) {
  const live = withoutCards(r.weights, [...r.known, ...board]);
  const combos = comboTotal(live);
  const last = r.steps[r.steps.length - 1];
  let lastLine: string | null = null;
  let capped = false;
  if (last) {
    const dead = [...r.known, ...last.board];
    const before = rangeBuckets(last.board, withoutCards(last.before, dead));
    const after = rangeBuckets(last.board, withoutCards(last.after, dead));
    const a = before.total > 0 ? before.rows.cpfs.combos / before.total : NaN;
    const b = after.total > 0 ? after.rows.cpfs.combos / after.total : NaN;
    capped = a >= 0.03 && b < a / 2;
    lastLine = `${streetName(last.street)} ${last.action}: can play for stacks ${pct(a)} → ${pct(b)}`;
  }
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold text-ink">{r.name}</span>
        <span className="text-muted">{r.position}</span>
        <span className="ml-auto text-muted">
          {r.playerType || 'Unknown'} {r.tags.map(statusIcon).join('')}
        </span>
      </div>
      {r.style && (
        <div className="text-muted" title="Saved player or profile from the Players page">
          {r.style.label !== r.name && <span className="text-ink">{r.style.label}: </span>}
          {styleSummary(r.style)}
        </div>
      )}
      {r.folded ? (
        <p className="text-muted">Folded.</p>
      ) : (
        <>
          <div className="text-ink">
            {combosText(combos)} combos <span className="text-faint">({pct(combos / 1326)} of all hands)</span>
          </div>
          {board.length >= 3 && <BucketBar weights={live} board={board} />}
          <p className="leading-snug text-faint">
            {r.explanation}
            {r.narrowed && r.steps.length > 0 && ` Narrowed by ${r.steps.length === 1 ? 'its action' : `its ${r.steps.length} actions`} after the flop.`}
          </p>
          {lastLine && <div className={capped ? 'font-semibold text-warn' : 'text-muted'}>{lastLine}{capped && ' · capped'}</div>}
        </>
      )}
      <div className="border-t border-line pt-1.5 text-faint">Click for the whole range{editable ? ' · click the cards to set them' : ''}.</div>
    </div>
  );
}
