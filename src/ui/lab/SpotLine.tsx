import { prettyCard, suitOf, type Card } from '../../core/cards';
import { potTotal } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import type { SeatNo } from '../../core/hand/types';
import type { Money } from '../replay/views';

// in core/cards.ts's suit order: ♠ ♥ ♦ ♣ (the dark spade lightened to read on the dark title bar)
const SUIT_COLOR = ['var(--text-muted)', 'var(--suit-h)', 'var(--suit-d)', 'var(--suit-c)'];

/** Cards as text with coloured suits: "A♠K♦". */
export function CardsText({ cards }: { cards: readonly Card[] }) {
  return (
    <span className="font-semibold whitespace-nowrap">
      {cards.map((c) => {
        const t = prettyCard(c);
        return (
          <span key={c}>
            {t.slice(0, -1)}
            <span style={{ color: SUIT_COLOR[suitOf(c)] }}>{t.slice(-1)}</span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The spot, in one line for a modal's title: who against whom (positions, types, known cards),
 * the board and the pot - "You (BTN, A♠K♦) vs Jansen (BB, Reg) · K♣7♦2♠ · pot €3.00".
 * `me` = the player the window is about; `others` = the players still in against him; `hero` =
 * the hand's Hero, called "You".
 */
export function SpotLine({
  state,
  me,
  others,
  hero,
  money,
}: {
  state: TableState;
  me: SeatNo;
  others: readonly SeatNo[];
  hero?: SeatNo;
  money: Money;
}) {
  const seat = (n: SeatNo) => state.seats.find((s) => s.seat === n);
  const who = (n: SeatNo) => {
    const s = seat(n);
    if (!s) return null;
    const you = n === hero;
    return (
      <span key={n}>
        {you ? 'You' : s.name} ({s.position}
        {s.playerType && !you ? `, ${s.playerType}` : ''}
        {s.cards?.length === 2 && (
          <>
            , <CardsText cards={s.cards} />
          </>
        )}
        )
      </span>
    );
  };
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      {who(me)}
      {others.length > 0 && <span className="text-faint">vs</span>}
      {others.map((o, i) => (
        <span key={o}>
          {who(o)}
          {i < others.length - 1 ? ',' : ''}
        </span>
      ))}
      <span className="text-faint">·</span>
      {state.board.length ? <CardsText cards={state.board} /> : <span>preflop</span>}
      <span className="text-faint">·</span>
      <span>pot {money(potTotal(state))}</span>
    </span>
  );
}
