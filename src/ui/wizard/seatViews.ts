import { parseCard } from '../../core/cards';
import type { TableState } from '../../core/engine/state';
import { formatAmount, type AmountDisplay } from '../format';
import { SQUID_ICON, playerTypeColor, statusIcon } from '../playerTypes';
import type { SeatView } from '../table/PokerTable';
import { isDealtIn, type WizardDraft } from './draft';

interface Options {
  positions: Map<number, string>;
  /** Engine state after the blinds (Review step): shows posted bets and who acts first. */
  state?: TableState | null;
  selected?: number | null;
  amounts: AmountDisplay;
  showAllCards: boolean;
}

export function draftSeatViews(d: WizardDraft, o: Options): SeatView[] {
  const money = (v: number) => formatAmount(v, d.currency, d.blinds.bb, o.amounts);
  return d.seats.map((p, seat) => {
    const selected = o.selected === seat;
    if (!p) {
      return { seat, empty: true, name: `Seat ${seat + 1}`, stackText: 'empty', icons: [], isHero: false, toAct: false, folded: false, sittingOut: false, selected };
    }
    const live = o.state?.seats.find((s) => s.seat === seat);
    const isHero = d.heroSeat === seat;
    const icons = [
      ...p.tags.map(statusIcon),
      ...(d.squid.enabled && p.squids > 0 ? [SQUID_ICON + (p.squids > 1 ? `×${p.squids}` : '')] : []),
    ];
    let cards: (number | null)[] | undefined;
    if (isDealtIn(p)) {
      const known = p.cards && (isHero || o.showAllCards) ? p.cards.map(parseCard) : null;
      cards = known ?? [null, null];
    }
    return {
      seat,
      empty: false,
      name: p.name || `Seat ${seat + 1}`,
      stackText: p.sittingOut ? 'sitting out' : money(live ? live.stack : p.stack),
      position: o.positions.get(seat) || undefined,
      typeColor: playerTypeColor(p.playerType),
      icons,
      isHero,
      toAct: o.state?.toAct === seat,
      folded: false,
      sittingOut: p.sittingOut,
      cards,
      betText: live && live.streetBet > 0 ? money(live.streetBet) : undefined,
      selected,
    };
  });
}
