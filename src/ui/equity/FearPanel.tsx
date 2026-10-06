import { useMemo, useState } from 'react';
import { BUCKETS, BUCKET_LABELS, bucketAll, type Bucket } from '../../core/buckets';
import { prettyCard, RANK_CHARS, type Card } from '../../core/cards';
import { groupFear, type GroupFear } from '../../core/fear';
import type { Weights } from '../../core/ranges/range';
import { useEquity } from '../lab/useEquity';

const SCARY = 0.1;
const pct = (x: number, digits = 0) => (Number.isNaN(x) ? '–' : `${(x * 100).toFixed(digits)}%`);
const SUIT_COLOURS = ['var(--text)', '#c62828', '#2f6fd6', '#1f8a4c'];

/** 0 = nothing taken (neutral) → half the lead or more (deep red). */
const fearColour = (v: number) => `rgba(198, 40, 40, ${Math.min(1, v / 0.5).toFixed(3)})`;

/**
 * A player's range by HHP bucket, with how fragile each bucket's lead is to the next card, and
 * the map of next cards for one bucket. Heads-up only: fear is measured against one range.
 */
export function FearPanel({
  player,
  board,
  weights,
  opponent,
  vsField,
  inputsKey,
  title,
}: {
  player: number;
  board: Card[];
  /** The player's range, known cards of the others already removed. */
  weights: Weights;
  /** The other player's range, likewise. */
  opponent: Weights;
  /** Equity of each of the player's combos (EQ page result), for the equity column. */
  vsField: Float32Array | undefined;
  /** Changes whenever weights, opponent or board change. */
  inputsKey: string;
  /** Heading; "Player N: buckets and fear" by default. */
  title?: string;
}) {
  const [picked, setPicked] = useState<Bucket>('cpfs');
  const { answer, pending } = useEquity({ kind: 'fear', a: weights, b: opponent, board }, `fear:${inputsKey}`);
  const fear = answer?.fear;

  const buckets = useMemo(() => bucketAll(board), [board]);
  const rows = useMemo(() => {
    if (!fear) return null;
    const out = new Map<Bucket, GroupFear & { equity: number; scary: number }>();
    for (const k of BUCKETS) {
      const g = groupFear(fear, weights, (c) => buckets[c] === k);
      if (!(g.combos > 0)) continue;
      let e = 0;
      let w = 0;
      for (let c = 0; c < 1326; c++) {
        const v = vsField?.[c];
        if (buckets[c] === k && weights[c]! > 0 && v !== undefined && !Number.isNaN(v)) {
          e += weights[c]! * v;
          w += weights[c]!;
        }
      }
      out.set(k, { ...g, equity: w > 0 ? e / w : NaN, scary: fear.nextCards.filter((c) => g.byCard[c]! >= SCARY).length });
    }
    return out;
  }, [fear, weights, buckets, vsField]);

  const total = rows ? [...rows.values()].reduce((s, r) => s + r.combos, 0) : 0;
  const shown = rows?.get(picked) ?? (rows ? [...rows.entries()][0]?.[1] : undefined);
  const shownKey = rows?.has(picked) ? picked : rows ? [...rows.keys()][0] : undefined;
  const street = board.length === 3 ? 'turn' : 'river';

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wider text-muted uppercase">{title ?? `Player ${player + 1}: buckets and fear`}</h2>
        {pending && <span className="text-xs text-muted">calculating…</span>}
      </div>
      {answer?.error && <p className="text-sm text-danger">{answer.error}</p>}
      {rows && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-semibold">Bucket</th>
                <th className="py-1 text-right font-semibold">Combos</th>
                {vsField && <th className="py-1 text-right font-semibold">Equity</th>}
                <th className="py-1 text-right font-semibold" title="Share of the other range this bucket beats right now">
                  Ahead now
                </th>
                <th className="py-1 text-right font-semibold" title={`Part of the lead one ${street} card takes away, on average`}>
                  Fear
                </th>
                <th className="py-1 text-right font-semibold" title={`${street} cards that take away ${pct(SCARY)} or more of the lead`}>
                  Scary cards
                </th>
              </tr>
            </thead>
            <tbody>
              {BUCKETS.filter((k) => rows.has(k)).map((k) => {
                const r = rows.get(k)!;
                return (
                  <tr
                    key={k}
                    onClick={() => setPicked(k)}
                    className={`cursor-pointer border-t border-line ${k === shownKey ? 'bg-surface-3' : 'hover:bg-surface-2'}`}
                  >
                    <td className="py-1.5 pl-1">{BUCKET_LABELS[k]}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {r.combos.toFixed(1).replace(/\.0$/, '')} <span className="text-xs text-faint">{pct(r.combos / total)}</span>
                    </td>
                    {vsField && <td className="py-1.5 text-right tabular-nums text-muted">{pct(r.equity)}</td>}
                    <td className="py-1.5 text-right tabular-nums">{pct(r.ahead)}</td>
                    <td className="py-1.5 text-right">
                      <span className="inline-block min-w-12 rounded px-1.5 text-center text-xs font-bold text-white tabular-nums" style={{ background: fearColour(r.fear * 2.5) }}>
                        {pct(r.fear, 1)}
                      </span>
                    </td>
                    <td className="py-1.5 pr-1 text-right tabular-nums">{r.scary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-faint">
            Fear = the part of a bucket's lead (what it beats now) that one {street} card takes away, on average. High on wet, dynamic boards,
            near zero on static ones. Click a bucket for its card map.
          </p>
          {shown && shownKey && <CardMap byCard={shown.byCard} board={board} title={`${BUCKET_LABELS[shownKey]}: what each ${street} card takes from its lead`} />}
        </>
      )}
    </section>
  );
}

function CardMap({ byCard, board, title }: { byCard: Float32Array; board: Card[]; title: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-xs font-semibold text-muted">{title}</div>
      <div className="grid gap-px rounded-md border border-line bg-line p-px" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
        {[0, 1, 2, 3].flatMap((suit) =>
          Array.from({ length: 13 }, (_, i) => {
            const card = suit * 13 + (12 - i);
            const v = byCard[card]!;
            const onBoard = board.includes(card);
            const known = !Number.isNaN(v);
            return (
              <div
                key={card}
                title={onBoard ? 'on the board' : known ? `${prettyCard(card)}: takes ${pct(v, 1)} of the lead` : `${prettyCard(card)}: can't come`}
                className="flex aspect-[4/5] flex-col items-center justify-center rounded-[2px] text-xs leading-none font-bold"
                style={{
                  background: onBoard ? 'var(--surface-3)' : known ? `linear-gradient(${fearColour(v)}, ${fearColour(v)}), var(--surface-2)` : 'var(--surface-2)',
                  color: onBoard || !known ? 'var(--text-faint)' : v >= 0.25 ? '#fff' : SUIT_COLOURS[suit],
                }}
              >
                <span>
                  {RANK_CHARS[12 - i]}
                  {'♠♥♦♣'[suit]}
                </span>
                {known && !onBoard && v >= 0.005 && <span className="mt-0.5 text-[10px] font-semibold opacity-90">{Math.round(v * 100)}</span>}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
