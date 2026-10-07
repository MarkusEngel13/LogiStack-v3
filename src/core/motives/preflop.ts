/**
 * Bots before the flop. The bot finds the spot it faces (open, vs limpers, vs an open, squeeze,
 * vs a 3-bet, vs a 4-bet), takes the chart for it, reads its hand's mix (raise / call / all-in)
 * and shifts it by player type: wider or tighter (Fish and whales play many more hands, nits
 * fewer), calling and limping instead of raising (recreational players), raising more (LAG,
 * maniac). Then it draws one action. Sizes follow HHP's live preflop guide.
 *
 * The library only has Reg charts, so the types are adjustments to them; the motive model takes
 * over after the flop (bot.ts).
 */

import { cardToString } from '../cards';
import { legalActions } from '../engine/replay';
import type { TableState } from '../engine/state';
import type { HandEvent, SeatNo } from '../hand/types';
import { CELLS, cellOfCards, comboCount } from '../ranges/hands';
import { chartPosition, PLAYER_TYPES, type Scenario } from '../ranges/library';
import { FOLD } from '../ranges/range';
import { actsLater, openerGroup, pickChart, type ChartChoice } from '../ranges/spot';
import { CELL_PERCENTILE } from '../ranges/strength';
import type { BotChoice, BotOption } from './bot';

/** How a player type bends the Reg chart before the flop. */
interface PreflopStyle {
  /** Range width against the chart: 2 = twice as many hands. */
  width: number;
  /** Raising against the chart: < 1 calls instead (premiums still raise), > 1 raises more. */
  raises: number;
  /** When first in: the share of opens that limp instead (premiums still raise). */
  limp: number;
}

const STYLES: Record<string, PreflopStyle> = {
  Reg: { width: 1, raises: 1, limp: 0 },
  TAG: { width: 0.95, raises: 1.1, limp: 0 },
  LAG: { width: 1.35, raises: 1.25, limp: 0 },
  Nit: { width: 0.7, raises: 0.9, limp: 0 },
  Fish: { width: 1.7, raises: 0.4, limp: 0.7 },
  Whale: { width: 2.6, raises: 0.5, limp: 0.6 },
  Maniac: { width: 2, raises: 1.7, limp: 0 },
};
/** Hands this good (share of all combos) raise whatever the type: AA-QQ, AK. */
const PREMIUM = 0.03;

export interface PreflopFacing {
  scenario: Scenario;
  /** The bot's position in 10-max names (what the charts use). */
  position: string;
  raises: number;
  limpers: number;
  /** Callers since the last raise. */
  callers: number;
  iRaised: boolean;
  /** Acts after the last raiser (or the limpers) once the flop comes. */
  inPosition: boolean;
}

/** The spot the player to act faces before the flop. */
export function preflopFacing(state: TableState, seat: SeatNo): PreflopFacing {
  const dealt = state.seats.filter((s) => s.dealtIn).length;
  const posOf = (s: SeatNo) => chartPosition(state.seats.find((x) => x.seat === s)?.position ?? '', dealt);
  const position = posOf(seat);
  let raises = 0;
  let limpers = 0;
  let callers = 0;
  let iRaised = false;
  let opener: SeatNo | null = null;
  let lastAggressor: SeatNo | null = null;
  const limperSeats: SeatNo[] = [];
  for (const e of state.log) {
    if (e.kind !== 'action' || e.street !== 'preflop') continue;
    if (e.action === 'raise' || e.action === 'bet') {
      raises++;
      opener ??= e.seat;
      lastAggressor = e.seat;
      callers = 0;
      if (e.seat === seat) iRaised = true;
    } else if (e.action === 'call') {
      if (raises === 0) {
        limpers++;
        limperSeats.push(e.seat);
      } else callers++;
    }
  }
  let scenario: Scenario;
  if (raises === 0) scenario = limpers === 0 ? 'RFI' : 'vs Limp';
  else if (raises === 1 && !iRaised) scenario = callers > 0 ? 'Squeeze' : openerGroup(posOf(opener!));
  else if (raises === 2 && iRaised) scenario = actsLater(position, posOf(lastAggressor!)) ? 'IP vs 3Bet' : 'OOP vs 3Bet';
  else scenario = 'vs 4Bet';
  const against = lastAggressor !== null ? [lastAggressor] : limperSeats;
  const inPosition = against.length > 0 && against.every((s) => actsLater(position, posOf(s)));
  return { scenario, position, raises, limpers, callers, iRaised, inPosition };
}

/**
 * The bot's action before the flop for the player to act, holding real cards. `charts` as in
 * the Lab (the library and yours); `rand` draws the action (0..1).
 */
export function preflopChoice(state: TableState, charts: readonly ChartChoice[], rand: () => number = Math.random): BotChoice {
  const legal = legalActions(state);
  if (!legal) throw new Error('Nobody is to act');
  if (state.board.length > 0) throw new Error('Preflop bots play before the flop only');
  const me = state.seats.find((s) => s.seat === legal.seat)!;
  if (!me.cards) throw new Error(`${me.name}'s cards are unknown: a bot needs real cards`);

  const f = preflopFacing(state, me.seat);
  const style = STYLES[me.playerType || 'Reg'] ?? STYLES.Reg!;
  const sizing = PLAYER_TYPES.find((t) => t.name === (me.playerType || 'Reg') && t.env === 'Live')?.sizingAggressiveness ?? 1;
  const chart = pickChart(charts, f.scenario, f.position, me.startStack / state.rules.bb);
  const cell = cellOfCards(me.cards[0]!, me.cards[1]!);
  const mix = chart?.chart[cell] ?? FOLD;
  const q = CELL_PERCENTILE[cell]!;

  // the chart's width, and this hand's place against the type's width
  let width = 0;
  if (chart) for (let c = 0; c < CELLS; c++) width += (comboCount(c) * (chart.chart[c]!.raise + chart.chart[c]!.call + chart.chart[c]!.allin)) / 100;
  width /= 1326;
  const target = Math.min(0.95, width * style.width);
  const fade = Math.max(0, Math.min(1, (target - q) / 0.04 + 0.5)); // 1 inside the target width, 0 outside
  const chartGo = (mix.raise + mix.call + mix.allin) / 100;
  const go = style.width >= 1 ? Math.max(chartGo, fade) : chartGo * fade;
  const scale = chartGo > 0 ? go / chartGo : 0;
  let allin = (mix.allin / 100) * scale;
  let raise = (mix.raise / 100) * scale;
  // hands the type adds to the chart: loose-passive types call (or limp), aggressive ones raise
  const added = Math.max(0, go - chartGo * scale);
  if (style.raises > 1) raise += added;
  const premium = q <= PREMIUM;
  if (!premium) raise = style.raises < 1 ? raise * style.raises : Math.min(go - allin, raise * style.raises);
  let call = Math.max(0, go - raise - allin);
  if (f.scenario === 'RFI' && !premium && style.limp > 0) {
    const limps = raise * style.limp;
    raise -= limps;
    call += limps;
  }
  // the charts have no limps when first in: only loose types complete; others raise or fold
  if (f.scenario === 'RFI' && style.limp === 0) {
    raise += call;
    call = 0;
  }

  // sizes (raise-to, in chips): opens 3 BB; isolation 6 BB + 1 per limper in position, 7 + 1 out of
  // it; 3-bets 3x in position, 4x out of it (+1x per caller); 4-bets 2.5x / 3x; 5-bets all-in
  const blind = state.blindLevel;
  const facing = state.currentBet;
  let to: number;
  if (f.scenario === 'RFI') to = 3 * blind;
  else if (f.scenario === 'vs Limp') to = (f.inPosition ? 6 : 7) * blind + f.limpers * blind;
  else if (f.raises === 1) to = (f.inPosition ? 3 : 4) * facing + f.callers * facing;
  else if (f.raises === 2) to = (f.inPosition ? 2.5 : 3) * facing;
  else to = legal.maxTo;
  const unit = Math.max(1, Math.round(state.rules.bb / 2));
  to = Math.round((to * sizing) / unit) * unit;

  const base = { type: 'action' as const, seat: me.seat };
  const raiseEvent: HandEvent =
    !(legal.canBet || legal.canRaise) ? { ...base, action: 'call' } : to >= legal.maxTo ? { ...base, action: 'allin' } : { ...base, action: legal.canBet ? 'bet' : 'raise', to: Math.max(to, legal.minTo) };
  const passive: HandEvent = legal.canCheck ? { ...base, action: 'check' } : { ...base, action: 'call' };
  const out: HandEvent = legal.canCheck ? { ...base, action: 'check' } : { ...base, action: 'fold' };
  // in the big blind with only limpers, "fold" is a check and "call" is a check too
  const options: BotOption[] = [
    { label: legal.canCheck ? 'Check' : 'Fold', p: Math.max(0, 1 - go), event: out },
    { label: legal.canCheck ? 'Check' : legal.toCall >= me.stack ? 'Call all-in' : f.raises === 0 ? 'Limp' : 'Call', p: call, event: passive },
    {
      label: raiseEvent.type === 'action' && raiseEvent.action === 'allin' ? 'All-in' : `Raise to ${(Math.max(to, legal.minTo) / blind).toFixed(1).replace(/\.0$/, '')} BB`,
      p: raise,
      event: raiseEvent,
    },
    { label: 'All-in', p: allin, event: { ...base, action: 'allin' } },
  ];
  // merge what the table makes the same (check / check, all-in / all-in)
  const merged: BotOption[] = [];
  for (const o of options) {
    const same = merged.find((m) => JSON.stringify(m.event) === JSON.stringify(o.event));
    if (same) same.p += o.p;
    else merged.push({ ...o });
  }
  const total = merged.reduce((s, o) => s + o.p, 0);
  for (const o of merged) o.p = total > 0 ? o.p / total : 0;

  let r = rand();
  let picked = merged.length - 1;
  for (let i = 0; i < merged.length; i++) {
    r -= merged[i]!.p;
    if (r < 0) {
      picked = i;
      break;
    }
  }
  return { seat: me.seat, options: merged, picked, event: merged[picked]!.event };
}

/** A random hand for a bot whose cards nobody knows yet, from the cards not seen anywhere. */
export function randomHand(unseen: readonly number[], rand: () => number = Math.random): [string, string] {
  const i = Math.floor(rand() * unseen.length);
  let j = Math.floor(rand() * (unseen.length - 1));
  if (j >= i) j++;
  const a = unseen[i]!;
  const b = unseen[j]!;
  return [cardToString(a), cardToString(b)];
}
