/**
 * Pure helpers for the replay screen: what each seat shows at a step, and how each log entry
 * reads in the action list. No React here, so it's all unit-tested.
 */

import { prettyCard } from '../../core/cards';
import { HandError, applyEvent, initialState } from '../../core/engine/replay';
import type { HandResult, LogEntry, SeatState, Street, TableState } from '../../core/engine/state';
import type { HandRecord } from '../../core/hand/types';
import { formatAmount, type AmountDisplay } from '../format';
import { SQUID_ICON, playerTypeColor, statusIcon } from '../playerTypes';
import type { ActionTone, SeatView } from '../table/PokerTable';

export type Money = (amount: number) => string;

export const moneyFor = (record: HandRecord, display: AmountDisplay): Money => (v) =>
  formatAmount(v, record.table.currency, record.table.blinds.bb, display);

/**
 * One state per step, like replaySteps(), but a bad event (e.g. in an imported file) stops the
 * replay there instead of failing the whole screen.
 */
export function safeSteps(record: HandRecord): { steps: TableState[]; error: HandError | null } {
  const steps = [initialState(record)];
  for (let i = 0; i < record.events.length; i++) {
    try {
      steps.push(applyEvent(steps[i]!, record.events[i]!, i));
    } catch (e) {
      return { steps, error: e instanceof HandError ? e : new HandError(String(e), i) };
    }
  }
  return { steps, error: null };
}

export const anchorSeat = (record: HandRecord) => record.hero ?? record.players[0]?.seat ?? 0;

function actionTag(s: SeatState): SeatView['action'] {
  const a = s.lastAction;
  if (!a || a.action === 'post') return undefined;
  if (a.action === 'fold') return { text: 'Fold', tone: 'fold' };
  if (a.action === 'check') return { text: 'Check', tone: 'check' };
  if (a.allIn) return { text: 'All-in', tone: 'allin' };
  if (a.action === 'call') return { text: 'Call', tone: 'call' };
  const word = a.action === 'bet' ? 'Bet' : 'Raise';
  return { text: a.blind ? `Blind ${word.toLowerCase()}` : word, tone: 'bet' };
}

/** Amount each seat collects at the end (all pots). */
export function winnings(result: HandResult | null): Map<number, number> {
  const won = new Map<number, number>();
  for (const pot of result?.pots ?? []) for (const [seat, amt] of Object.entries(pot.shares)) won.set(+seat, (won.get(+seat) ?? 0) + amt);
  return won;
}

export function replaySeatViews(
  record: HandRecord,
  state: TableState,
  opts: { money: Money; showAllCards: boolean; isLastStep: boolean },
): SeatView[] {
  const hero = record.hero;
  const finished = opts.isLastStep && (state.phase === 'showdown' || state.phase === 'complete');
  const won = finished ? winnings(state.result) : new Map<number, number>();

  return state.seats.map((s) => {
    const isHero = s.seat === hero;
    let cards: (number | null)[] | undefined;
    if (s.dealtIn && !s.folded && !s.mucked) {
      const visible = isHero || opts.showAllCards || s.shown || state.phase === 'showdown';
      cards = s.cards && visible ? s.cards : [null, null];
    }
    const winAmount = won.get(s.seat);
    // At the end, show what everyone walks away with (pots, rake, 7-2 and squid payments included).
    const finalStack = finished ? state.result?.finalStacks[s.seat] : undefined;
    return {
      seat: s.seat,
      empty: false,
      name: s.name,
      stackText: !s.dealtIn
        ? 'sitting out'
        : finalStack !== undefined
          ? opts.money(finalStack)
          : s.allIn && s.stack === 0
            ? 'All-in'
            : opts.money(s.stack),
      position: s.position || undefined,
      typeColor: playerTypeColor(s.playerType),
      icons: [...s.tags.map(statusIcon), ...(s.squids > 0 ? [SQUID_ICON + (s.squids > 1 ? `×${s.squids}` : '')] : [])],
      isHero,
      toAct: state.toAct === s.seat,
      folded: s.folded,
      sittingOut: !s.dealtIn,
      cards,
      betText: s.streetBet > 0 ? opts.money(s.streetBet) : undefined,
      action: winAmount ? { text: `Wins ${opts.money(winAmount)}`, tone: 'win' } : actionTag(s),
      winner: !!winAmount,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// action list

export interface ListRow {
  key: string;
  /** Step to jump to when clicked (state after this entry), or null if not clickable. */
  step: number | null;
  /** Event index that produced the row; posts have -1, result rows Infinity. */
  event: number;
  tone: ActionTone;
  text: string;
  cards?: number[];
  /** Street header to draw above this row. */
  street?: Street | 'result';
}

const POST_NAMES = { ante: 'ante', sb: 'small blind', bb: 'big blind', straddle: 'straddle' } as const;
const STREET_NAMES: Record<Street, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
export const streetName = (s: Street | 'result') => (s === 'result' ? 'Result' : STREET_NAMES[s]);

export function describeEntry(e: LogEntry, name: (seat: number) => string, money: Money): { text: string; tone: ActionTone; cards?: number[] } {
  switch (e.kind) {
    case 'post':
      return { text: `${name(e.seat)} posts ${POST_NAMES[e.post]} ${money(e.amount)}${e.allIn ? ' (all-in)' : ''}`, tone: 'post' };
    case 'action': {
      const who = name(e.seat);
      const allIn = e.allIn ? ' and is all-in' : '';
      const blind = e.blind ? ' blind' : '';
      switch (e.action) {
        case 'fold':
          return { text: `${who} folds`, tone: 'fold' };
        case 'check':
          return { text: `${who} checks`, tone: 'check' };
        case 'call':
          return { text: `${who} calls ${money(e.added)}${allIn}`, tone: e.allIn ? 'allin' : 'call' };
        case 'bet':
          return { text: `${who} bets${blind} ${money(e.to)}${allIn}`, tone: e.allIn ? 'allin' : 'bet' };
        case 'raise':
          return { text: `${who} raises${blind} to ${money(e.to)}${allIn}`, tone: e.allIn ? 'allin' : 'bet' };
      }
      break;
    }
    case 'board':
      return { text: STREET_NAMES[e.street], tone: 'info', cards: e.cards };
    case 'refund':
      return { text: `Uncalled ${money(e.amount)} returned to ${name(e.seat)}`, tone: 'info' };
    case 'show':
      return { text: `${name(e.seat)} shows ${e.cards.map(prettyCard).join(' ')}`, tone: 'info', cards: e.cards };
    case 'muck':
      return { text: `${name(e.seat)} mucks`, tone: 'fold' };
  }
  return { text: '', tone: 'info' };
}

function resultRows(result: HandResult, name: (seat: number) => string, money: Money): ListRow[] {
  const rows: ListRow[] = [];
  const multi = result.pots.length > 1;
  result.pots.forEach((pot, i) => {
    const which = multi ? (i === 0 ? ' from the main pot' : ` from side pot ${i}`) : '';
    const hand = pot.winningHand ? ` with ${pot.winningHand}` : '';
    if (!pot.winners) {
      rows.push({ key: `pot-${i}`, step: null, event: Infinity, tone: 'info', text: `Pot of ${money(pot.amount)}: winner unknown (cards not shown)` });
      return;
    }
    for (const seat of pot.winners) {
      rows.push({ key: `pot-${i}-${seat}`, step: null, event: Infinity, tone: 'win', text: `${name(seat)} wins ${money(pot.shares[seat] ?? 0)}${which}${hand}` });
    }
  });
  if (result.rake > 0) rows.push({ key: 'rake', step: null, event: Infinity, tone: 'info', text: `Rake ${money(result.rake)}` });
  for (const b of result.bounties)
    rows.push({ key: `b-${b.from}`, step: null, event: Infinity, tone: 'win', text: `7-2 bounty: ${name(b.from)} pays ${name(b.to)} ${money(b.amount)}` });
  for (const seat of result.squid?.awarded ?? []) rows.push({ key: `sq-${seat}`, step: null, event: Infinity, tone: 'win', text: `${name(seat)} gets a squid` });
  for (const p of result.squid?.payout ?? [])
    rows.push({ key: `sqp-${p.to}`, step: null, event: Infinity, tone: 'win', text: `Squid payout: ${name(p.from)} pays ${name(p.to)} ${money(p.amount)}` });
  if (rows.length) rows[0]!.street = 'result';
  return rows;
}

/** All rows of the hand, taken from the final state's log, with street headers. */
export function actionRows(record: HandRecord, final: TableState, money: Money): ListRow[] {
  const names = new Map(record.players.map((p) => [p.seat, p.name]));
  const name = (seat: number) => names.get(seat) ?? `Seat ${seat + 1}`;
  const rows: ListRow[] = [];
  let street: Street = 'preflop';
  final.log.forEach((e, i) => {
    const d = describeEntry(e, name, money);
    const row: ListRow = { key: `log-${i}`, step: e.event === null ? 0 : e.event + 1, event: e.event ?? -1, ...d };
    if (i === 0) row.street = 'preflop';
    if (e.kind === 'board') {
      street = e.street;
      row.street = street;
    }
    rows.push(row);
  });
  if (final.result && (final.phase === 'showdown' || final.phase === 'complete')) rows.push(...resultRows(final.result, name, money));
  return rows;
}

/** Short end-of-hand lines for the pot box: rake and side games (winners show on the plates). */
export function resultSummary(record: HandRecord, result: HandResult | null, money: Money): string[] {
  if (!result) return [];
  const names = new Map(record.players.map((p) => [p.seat, p.name]));
  const name = (seat: number) => names.get(seat) ?? `Seat ${seat + 1}`;
  const lines: string[] = [];
  if (result.rake > 0) lines.push(`Rake ${money(result.rake)}`);
  const bounty = new Map<number, number>();
  for (const b of result.bounties) bounty.set(b.to, (bounty.get(b.to) ?? 0) + b.amount);
  for (const [seat, amt] of bounty) lines.push(`7-2: ${name(seat)} collects ${money(amt)}`);
  for (const seat of result.squid?.awarded ?? []) lines.push(`${name(seat)} gets a squid`);
  const payout = result.squid?.payout ?? [];
  if (payout.length) lines.push(`${name(payout[0]!.from)} pays ${money(payout.reduce((s, p) => s + p.amount, 0))} for squids`);
  if (!result.resolved) lines.push('Winner unknown: cards not shown');
  return lines;
}

/** First step of each street, for the jump buttons. */
export function streetSteps(steps: TableState[]): Partial<Record<Street | 'result', number>> {
  const out: Partial<Record<Street | 'result', number>> = { preflop: 0 };
  steps.forEach((s, i) => {
    if (out[s.street] === undefined) out[s.street] = i;
  });
  const last = steps[steps.length - 1]!;
  if (last.phase === 'showdown' || last.phase === 'complete') out.result = steps.length - 1;
  return out;
}
