import { useState } from 'react';
import { prettyCard, RANK_CHARS, suitOf, type Card } from '../../core/cards';
import { sizeKey, type SizeQuestion } from '../../core/motives/sizes';
import type { WhatIfAnswer, WhatIfLine } from '../../core/motives/whatIf';
import { comboTotal, withoutCards } from '../../core/ranges/range';
import { Modal } from '../controls';
import type { Money } from '../replay/views';
import { BucketBar, combosText, SharesBar } from './RangeStory';
import { useEquity } from './useEquity';

const pct = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);
const SUIT_COLOURS = ['var(--text)', '#d6262b', '#2f6fd6', '#1f8a4c'];

/** How a next card treats the actor, averaged over the lines: equity change (or the other range's strength). */
function cardShift(a: WhatIfAnswer, card: number): number {
  let sum = 0;
  let n = 0;
  for (const l of a.lines) {
    const x = l.cards[card];
    if (!x) continue;
    if (x.equity !== undefined && l.equityNow !== undefined && !Number.isNaN(x.equity)) sum += x.equity - l.equityNow;
    else sum -= (x.buckets.cpfs ?? 0) - l.stacksNow;
    n++;
  }
  return n ? sum / n : NaN;
}

const shiftColour = (v: number) =>
  Number.isNaN(v) ? 'var(--surface-2)' : v < 0 ? `rgba(198, 40, 40, ${Math.min(0.9, -v * 3).toFixed(2)})` : `rgba(31, 138, 76, ${Math.min(0.9, v * 3).toFixed(2)})`;

function CardName({ card }: { card: Card }) {
  const t = prettyCard(card);
  return (
    <span className="font-bold">
      {t[0]}
      <span style={{ color: SUIT_COLOURS[suitOf(card)] }}>{t[1]}</span>
    </span>
  );
}

/**
 * What happens if: for each line (check, bet small, bet big, overbet - or call and raise), how the
 * other player answers now and what reaches the next street, on a blank, a scare card or any
 * card you pick. A small bet keeps their weak hands in; a big one leaves the strong ones.
 */
export function WhatIfModal({
  title,
  q,
  money,
  otherName,
  onClose,
}: {
  title: string;
  q: SizeQuestion;
  money: Money;
  otherName: string;
  onClose: () => void;
}) {
  const { answer, pending } = useEquity({ kind: 'whatif', q }, `whatif:${sizeKey(q)}`);
  const a = answer?.whatIf;
  const [picked, setPicked] = useState<number | null>(null);
  const card = picked ?? a?.blank ?? null;
  const board = q.situation.board;
  const dead = q.actor.cards ?? [];
  const street = a?.street ?? (board.length === 3 ? 'turn' : 'river');

  return (
    <Modal title={title} wide="xl" onClose={onClose}>
      {pending && !a && <p className="text-sm text-muted">Playing out every line and every {street} card (a few seconds)…</p>}
      {answer?.error && <p className="text-sm text-danger">{answer.error}</p>}
      {a && card !== null && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">The {street}:</span>
            {[
              { c: a.blank, label: 'blank' },
              { c: a.scare, label: 'scare card' },
            ].map(({ c, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => setPicked(c)}
                className={`rounded-md border px-2.5 py-1 ${card === c ? 'border-accent bg-surface-3' : 'border-line hover:border-accent'}`}
              >
                <CardName card={c} /> <span className="text-xs text-muted">{label}</span>
              </button>
            ))}
            <span className="text-xs text-faint">or pick any card below</span>
          </div>

          <div className="grid gap-px rounded-md border border-line bg-line p-px" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
            {[0, 1, 2, 3].flatMap((suit) =>
              Array.from({ length: 13 }, (_, i) => {
                const c = suit * 13 + (12 - i);
                const can = a.lines[0]?.cards[c] != null;
                const v = can ? cardShift(a, c) : NaN;
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={!can}
                    onClick={() => setPicked(c)}
                    title={can ? `${prettyCard(c)}: your equity ${v >= 0 ? '+' : ''}${Math.round(v * 100)} points on average` : `${prettyCard(c)}: can't come`}
                    className={`rounded-[2px] py-1 text-center text-xs font-bold ${c === card ? 'outline-2 outline-accent' : ''}`}
                    style={{
                      background: can ? `linear-gradient(${shiftColour(v)}, ${shiftColour(v)}), var(--surface-2)` : 'var(--surface-3)',
                      color: can ? (Math.abs(v) > 0.2 ? '#fff' : SUIT_COLOURS[suit]) : 'var(--text-faint)',
                    }}
                  >
                    {RANK_CHARS[12 - i]}
                    {'♠♥♦♣'[suit]}
                  </button>
                );
              }),
            )}
          </div>
          <p className="-mt-2 text-[11px] text-faint">
            Card colour = how the {street} card changes your equity against what reaches it, on average over the lines (green better, red worse).
          </p>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {a.lines.map((l) => (
              <LineCard key={l.label} l={l} card={card} board={board} dead={dead} money={money} street={street} otherName={otherName} />
            ))}
          </div>

          <p className="text-[11px] leading-snug text-faint">
            "Reaches the {street}" = the part of {otherName}'s range that calls (or checks behind) - their whole range when the line just
            ends the street. Both players decide by the fear-and-greed model with their type and status; the equity is yours against
            that range, with your cards.
          </p>
        </div>
      )}
    </Modal>
  );
}

function LineCard({
  l,
  card,
  board,
  dead,
  money,
  street,
  otherName,
}: {
  l: WhatIfLine;
  card: number;
  board: Card[];
  dead: readonly Card[];
  money: Money;
  street: string;
  otherName: string;
}) {
  const at = l.cards[card];
  const combos = comboTotal(withoutCards(l.next, [...board, ...dead]));
  const delta = at?.equity !== undefined && l.equityNow !== undefined ? at.equity - l.equityNow : undefined;
  return (
    <div className="space-y-2.5 rounded-lg border border-line bg-surface-2/50 p-3 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-bold">{l.label}</span>
        {l.amount > 0 && <span className="text-xs text-muted">{money(l.amount)}</span>}
      </div>
      <div className="text-xs text-muted">
        {l.answer ? (
          <>
            {otherName}:{' '}
            {[
              l.answer.fold > 0.005 ? `folds ${pct(l.answer.fold)}` : null,
              `${l.answer.passiveLabel} ${pct(l.answer.passive)}`,
              `${l.answer.aggressiveLabel}s ${pct(l.answer.aggressive)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </>
        ) : (
          'The street ends here.'
        )}
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted">Reaches the {street}</span>
          <span className="tabular-nums">
            {combosText(combos)} combos · pot {money(l.pot)}
          </span>
        </div>
        <BucketBar weights={withoutCards(l.next, [...board, ...dead])} board={board} />
        {l.equityNow !== undefined && <div className="mt-1 text-xs text-muted">Your equity against it now: {pct(l.equityNow)}</div>}
      </div>
      {at && (
        <div className="border-t border-line pt-2">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-muted">
              On the <CardName card={card} />
            </span>
            {at.equity !== undefined && (
              <span className="tabular-nums">
                your equity {pct(at.equity)}
                {delta !== undefined && Math.abs(delta) >= 0.005 && (
                  <span className={delta < 0 ? 'text-danger' : 'text-ok'}>
                    {' '}
                    ({delta > 0 ? '+' : '−'}
                    {Math.round(Math.abs(delta) * 100)})
                  </span>
                )}
              </span>
            )}
          </div>
          <SharesBar shares={at.buckets} />
        </div>
      )}
    </div>
  );
}
