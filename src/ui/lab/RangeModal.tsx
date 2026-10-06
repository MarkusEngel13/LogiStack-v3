import { useMemo, useState } from 'react';
import { BUCKETS, bucketAll, type Bucket } from '../../core/buckets';
import type { Card } from '../../core/cards';
import { fingerprint, type StoryStep } from '../../core/motives/story';
import { CELLS, CELL_NAMES, comboCount, combosOfCell, comboLabel } from '../../core/ranges/hands';
import { comboTotal, withoutCards, type Weights } from '../../core/ranges/range';
import { Modal } from '../controls';
import { FearPanel } from '../equity/FearPanel';
import { RangeGrid, type Segment } from '../ranges/RangeGrid';
import { streetName } from '../replay/views';
import { BUCKET_COLORS, BUCKET_SHORT, BucketBar, combosText, RangeStory } from './RangeStory';
import { weightSegments } from './VillainRangeModal';

/** Suit colours as on the four-colour deck: ♠ text, ♥ red, ♦ blue, ♣ green. */
const SUIT_COLOURS: Record<string, string> = { '♠': 'var(--text)', '♥': '#d6262b', '♦': '#2f6fd6', '♣': '#1f8a4c' };

/** "K♣J♣" with each suit in its colour (♣ and ♠ look alike when small). */
function Combo({ combo }: { combo: number }) {
  const text = comboLabel(combo, true);
  return (
    <span className="w-10 font-semibold">
      {[text.slice(0, 2), text.slice(2)].map((card, i) => (
        <span key={i}>
          {card[0]}
          <span style={{ color: SUIT_COLOURS[card[1]!] }}>{card[1]}</span>
        </span>
      ))}
    </span>
  );
}

/** The part of a cell an action took out. */
const GONE = 'rgba(150, 150, 150, 0.45)';

/** Each cell: what is left, coloured by bucket, then what was taken out (grey); empty = never there. */
function storySegments(kept: Weights, removed: Weights, board: Card[]): Segment[][] {
  const buckets = bucketAll(board);
  return Array.from({ length: CELLS }, (_, cell) => {
    const per = new Map<Bucket, number>();
    let gone = 0;
    for (const c of combosOfCell(cell)) {
      const b = buckets[c];
      if (!b) continue;
      if (kept[c]! > 0) per.set(b, (per.get(b) ?? 0) + kept[c]!);
      gone += removed[c]!;
    }
    const n = comboCount(cell);
    const segs: Segment[] = BUCKETS.filter((b) => per.has(b)).map((b) => ({ color: BUCKET_COLORS[b], pct: (per.get(b)! / n) * 100 }));
    if (gone > 0.0005) segs.push({ color: GONE, pct: (gone / n) * 100 });
    return segs;
  });
}

/**
 * One player's range up close: the 13x13 with what each action took out greyed, the story with
 * the motive behind each bucket's choice, and (flop or turn, heads-up) the fear map of the next
 * card against the other player's range.
 */
export function RangeModal({
  title,
  seat,
  steps,
  step,
  current,
  board,
  known,
  opponent,
  note,
  onClose,
}: {
  title: string;
  seat: number;
  steps: readonly StoryStep[];
  step: number;
  /** The range at this step. */
  current: Weights;
  board: Card[];
  /** Cards this range can't hold (the player to act's own cards). */
  known: readonly Card[];
  /** The other player's range at this step (heads-up), for the fear map. */
  opponent?: Weights;
  /** Where the range comes from (chart for the preflop spot, your range, ...). */
  note?: string;
  onClose: () => void;
}) {
  const mine = useMemo(() => steps.filter((s) => s.seat === seat && s.event < step && !s.skipped), [steps, seat, step]);
  const [view, setView] = useState<'now' | number>('now');
  const [hover, setHover] = useState<number | null>(null);

  const shown = view === 'now' ? null : mine.find((s) => s.event === view) ?? null;
  const kept = shown ? shown.after : current;
  const from = shown ? shown.before : (mine[0]?.before ?? current);
  const onBoard = shown ? shown.board : board;
  // before the flop there are no buckets: the range is the chart, filled by weight
  const preflop = onBoard.length < 3;
  const dead = useMemo(() => [...known, ...onBoard], [known, onBoard]);

  const { fills, keptLive, fromLive, removed } = useMemo(() => {
    const k = withoutCards(kept, dead);
    const f = withoutCards(from, dead);
    const r = new Float32Array(1326);
    for (let c = 0; c < 1326; c++) r[c] = Math.max(0, f[c]! - k[c]!);
    return { fills: preflop ? weightSegments(k) : storySegments(k, r, onBoard), keptLive: k, fromLive: f, removed: r };
  }, [kept, from, dead, onBoard, preflop]);

  const buckets = useMemo(() => (preflop ? [] : bucketAll(onBoard)), [onBoard, preflop]);
  const hovered =
    hover === null
      ? []
      : combosOfCell(hover)
          .filter((c) => fromLive[c]! > 0 || keptLive[c]! > 0)
          .map((c) => ({ c, b: buckets[c], kept: keptLive[c]!, from: fromLive[c]! }))
          .sort((x, y) => y.kept - x.kept);

  const fearOk = view === 'now' && opponent && (board.length === 3 || board.length === 4);
  const what = shown ? `${streetName(shown.street)}: ${shown.action}` : mine.length > 0 ? 'Now, after its actions since the flop' : 'Now';

  return (
    <Modal title={title} wide="xl" onClose={onClose}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {(['now', ...mine.map((s) => s.event)] as const).map((v) => {
              const s = v === 'now' ? null : mine.find((x) => x.event === v)!;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${view === v ? 'border-accent bg-surface-3 text-ink' : 'border-line text-muted hover:text-ink'}`}
                >
                  {s ? `${streetName(s.street)} ${s.action}` : 'Now'}
                </button>
              );
            })}
          </div>
          <RangeGrid fills={fills} onHover={(cell) => setHover(cell)} cursor="default" />
          <div className="text-sm text-muted">
            {what}: <span className="text-ink">{combosText(comboTotal(keptLive))} combos</span>
            {comboTotal(removed) > 0.05 && (
              <span className="text-faint">
                {' '}
                of {combosText(comboTotal(fromLive))} · <span style={{ color: GONE }}>■</span> grey = taken out {shown ? 'by this action' : 'since the flop'}
              </span>
            )}
          </div>
          {!preflop && <BucketBar weights={keptLive} board={onBoard} />}
          <div className="min-h-[72px] rounded-md border border-line bg-surface-2 px-3 py-2 text-xs">
            {hover === null ? (
              <span className="text-faint">
                Point at a cell to see its combos: {preflop ? 'how much of each is in the range.' : 'what is left of each, and its bucket on this board.'}
              </span>
            ) : (
              <>
                <div className="mb-1 font-semibold">{CELL_NAMES[hover]}</div>
                {hovered.length === 0 ? (
                  <span className="text-faint">Not in the range.</span>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {hovered.map((h) => (
                      <div key={h.c} className="flex items-center gap-1.5 tabular-nums">
                        <Combo combo={h.c} />
                        {h.b && (
                          <span className="w-12" style={{ color: BUCKET_COLORS[h.b] }}>
                            {BUCKET_SHORT[h.b]}
                          </span>
                        )}
                        <span className={h.kept > 0.005 ? '' : 'text-faint'}>
                          {Math.round(h.kept * 100)}%
                          {h.from > h.kept + 0.005 && <span className="text-faint"> of {Math.round(h.from * 100)}%</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {note && <p className="text-sm leading-snug text-muted">{note}</p>}
          {preflop ? (
            <p className="text-sm leading-snug text-faint">
              After the flop the range narrows at every action, by the fear-and-greed model; this window then shows the buckets, what each
              action took out and why.
            </p>
          ) : (
          <div>
            <div className="mb-1 text-xs font-bold tracking-wider text-muted uppercase">Its actions, bucket by bucket</div>
            {mine.length === 0 ? (
              <p className="text-sm text-faint">No action after the flop yet.</p>
            ) : (
              <RangeStory seat={seat} steps={steps} step={step} known={known} detailed />
            )}
            <p className="mt-1.5 text-[11px] leading-snug text-faint">
              Each bucket's bar = how much of it took the action. The line under it = the option it preferred, the one it beat, and the
              motives that tipped it (amounts in pots: greed = what it can win, fear = the lead the next cards can take, trapping = worse
              hands kept in, ...).
            </p>
          </div>
          )}
          {fearOk && (
            <FearPanel
              player={seat}
              title={`Fear of the next ${board.length === 3 ? 'turn' : 'river'} card, against the other range`}
              board={board}
              weights={withoutCards(current, [...known, ...board])}
              opponent={withoutCards(opponent!, board)}
              vsField={undefined}
              inputsKey={`${fingerprint(current)}:${fingerprint(opponent!)}:${board.join(',')}:${known.join(',')}`}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
