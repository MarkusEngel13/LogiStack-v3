/**
 * A player's preflop range from what they did: find their spot (opened, called an open, 3-bet,
 * ...), take the chart for it and keep the part matching their action. A cell that raises 50 %
 * gives weight 0.5 to a player who raised. Postflop actions don't narrow it (yet).
 */

import type { SeatNo } from '../hand/types';
import type { TableState } from '../engine/state';
import { chartPosition, TEN_MAX_POSITIONS, type Scenario } from './library';
import { CELLS, combosOfCell } from './hands';
import { comboTotal, emptyWeights, type Chart, type Weights } from './range';

/** What the player did in their spot, as far as the chart is concerned. */
export type Took = 'raise' | 'call' | 'check' | 'any';

export interface PreflopSpot {
  scenario: Scenario | null;
  took: Took;
  /** The player's position in 10-max names (what the charts use). */
  position: string;
  /** Plain words: "opened from the CO", "called an open from the HJ", ... */
  story: string;
}

/** Order of play after the flop: SB first, button last. */
const POSTFLOP_ORDER = ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN'];
/**  acts after  after the flop (10-max position names). */
export const actsLater = (a: string, b: string) => POSTFLOP_ORDER.indexOf(a) > POSTFLOP_ORDER.indexOf(b);

/** The chart scenario for facing an open from this position. */
export const openerGroup = (pos: string): Scenario => {
  if (pos === 'UTG' || pos === 'UTG+1' || pos === 'UTG+2') return 'vs RFI EP';
  if (pos === 'UTG+3' || pos === 'LJ' || pos === 'HJ') return 'vs RFI MP';
  if (pos === 'CO') return 'vs RFI CO';
  if (pos === 'BTN') return 'vs RFI BTN';
  return 'vs RFI SB';
};

/** The spot behind a player's last voluntary preflop action. */
export function preflopSpot(state: TableState, seat: SeatNo): PreflopSpot {
  const dealt = state.seats.filter((s) => s.dealtIn).length;
  const posOf = (s: SeatNo) => chartPosition(state.seats.find((x) => x.seat === s)?.position ?? '', dealt);
  const position = posOf(seat);

  let raises = 0;
  let limpers = 0;
  let callersSinceRaise = 0;
  let opener: SeatNo | null = null;
  let lastRaiser: SeatNo | null = null;
  let spot: PreflopSpot = { scenario: null, took: 'any', position, story: 'no voluntary action before the flop' };

  for (const e of state.log) {
    if (e.kind !== 'action' || e.street !== 'preflop') continue;
    const { action } = e;
    if (e.seat === seat && action !== 'fold') {
      const raised = action === 'raise' || action === 'bet';
      const took: Took = raised ? 'raise' : action === 'call' ? 'call' : 'check';
      if (raises === 0 && limpers === 0) {
        spot = raised
          ? { scenario: 'RFI', took, position, story: `opened from the ${position}` }
          : { scenario: null, took: 'any', position, story: action === 'call' ? `limped from the ${position}` : 'checked the big blind' };
      } else if (raises === 0) {
        spot = {
          scenario: 'vs Limp',
          took,
          position,
          story: raised ? `raised over ${limpers} limper${limpers > 1 ? 's' : ''}` : action === 'call' ? 'limped behind' : 'checked behind the limpers',
        };
      } else if (raises === 1 && seat !== opener) {
        const group = openerGroup(posOf(opener!));
        if (raised && callersSinceRaise > 0) spot = { scenario: 'Squeeze', took, position, story: `squeezed after an open from the ${posOf(opener!)} and a call` };
        else spot = { scenario: group, took, position, story: `${raised ? '3-bet' : 'called'} an open from the ${posOf(opener!)}` };
      } else if (raises === 2) {
        const threeBettor = posOf(lastRaiser!);
        const ip = actsLater(position, threeBettor);
        spot = { scenario: ip ? 'IP vs 3Bet' : 'OOP vs 3Bet', took, position, story: `${raised ? '4-bet' : 'called'} a 3-bet from the ${threeBettor}` };
      } else {
        spot = { scenario: 'vs 4Bet', took, position, story: `${raised ? 'raised' : 'called'} a ${raises + 1}-bet from the ${posOf(lastRaiser!)}` };
      }
    }
    // update the picture after this action
    if (action === 'raise' || action === 'bet') {
      raises++;
      if (opener === null) opener = e.seat;
      lastRaiser = e.seat;
      callersSinceRaise = 0;
    } else if (action === 'call') {
      if (raises === 0) limpers++;
      else callersSinceRaise++;
    }
  }
  return spot;
}

export interface ChartChoice {
  id: string;
  label: string;
  scenario: Scenario;
  positions: string[];
  stack: string;
  env: 'Live' | 'Online';
  chart: Chart;
  /** Your own chart (preferred over the library's for the same spot). */
  mine?: boolean;
}

/**
 * The best chart for a spot: same scenario, the position itself or the nearest one, the stack
 * depth that fits (200 BB from 150 BB deep), live before online, your own before the library's.
 */
export function pickChart(charts: readonly ChartChoice[], scenario: Scenario, position: string, stackBB: number): ChartChoice | null {
  const ladder = TEN_MAX_POSITIONS as readonly string[];
  const wantStack = stackBB >= 150 ? '200BB' : '100BB';
  const at = ladder.indexOf(position);
  const distance = (c: ChartChoice) => Math.min(...c.positions.map((p) => Math.abs(ladder.indexOf(p) - at)));
  const score = (c: ChartChoice) => distance(c) * 100 + (c.stack === wantStack ? 0 : 10) + (c.env === 'Live' ? 0 : 5) + (c.mine ? 0 : 1);
  const candidates = charts.filter((c) => c.scenario === scenario);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (score(c) < score(best) ? c : best));
}

/**
 * Combo weights for what the player took: raise (incl. all-in), call, check (= didn't raise),
 * continue (raise or call), any.
 */
export function weightsFor(chart: Chart | null, took: Took | 'continue'): Weights {
  const w = emptyWeights();
  for (let cell = 0; cell < CELLS; cell++) {
    const m = chart?.[cell];
    let share = 1;
    if (chart && m) {
      if (took === 'raise') share = (m.raise + m.allin) / 100;
      else if (took === 'call') share = m.call / 100;
      else if (took === 'check') share = 1 - (m.raise + m.allin) / 100;
      else if (took === 'continue') share = (m.raise + m.call + m.allin) / 100;
    }
    if (share > 0) for (const c of combosOfCell(cell)) w[c] = Math.min(1, share);
  }
  return w;
}

export interface SpotRange {
  spot: PreflopSpot;
  chart: ChartChoice | null;
  weights: Weights;
  /** One line for the screen: what they did and which chart part stands for it. */
  explanation: string;
}

const TOOK_WORDS: Record<Took, string> = { raise: 'raising', call: 'calling', check: 'non-raising', any: 'all' };

export function spotRange(state: TableState, seat: SeatNo, charts: readonly ChartChoice[]): SpotRange {
  const spot = preflopSpot(state, seat);
  const player = state.seats.find((s) => s.seat === seat);
  const stackBB = player ? player.startStack / state.rules.bb : 100;
  const chart = spot.scenario && spot.took !== 'any' ? pickChart(charts, spot.scenario, spot.position, stackBB) : null;
  if (!chart) {
    return { spot, chart, weights: weightsFor(null, 'any'), explanation: `${capital(spot.story)}: no chart for that, so any two cards.` };
  }
  let weights = weightsFor(chart.chart, spot.took);
  let explanation = `${capital(spot.story)}: the ${TOOK_WORDS[spot.took]} hands of “${chart.label}”.`;
  if (comboTotal(weights) < 1) {
    // The chart never takes this action here (e.g. 3-bet or fold, no flat calls): use every hand it plays.
    weights = weightsFor(chart.chart, 'continue');
    explanation = `${capital(spot.story)}: “${chart.label}” never does that, so every hand it plays on.`;
  }
  return { spot, chart, weights, explanation };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
