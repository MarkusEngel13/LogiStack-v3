/**
 * What a style does, in numbers you can check against the person: a handful of fixed spots run
 * through the same code the bots use - preflop the bent charts (preflop.ts's bendMix), after the
 * flop the motive model (decide.ts). The Players page shows these next to the sliders.
 *
 * Spots: a 100 BB game, the button opens and the big blind calls (ranges as in the doctrine tests).
 */

import { bucketAll, type Bucket } from '../buckets';
import { parseCards } from '../cards';
import { decide, type Decision, type OptionKind, type Situation } from '../motives/decide';
import type { MotiveProfile } from '../motives/profile';
import { bendMix, type PreflopStyle } from '../motives/preflop';
import { CELLS, comboCount } from '../ranges/hands';
import { parseRange } from '../ranges/notation';
import { pickChart, type ChartChoice } from '../ranges/spot';
import type { Scenario } from '../ranges/library';

export interface PreflopRow {
  label: string;
  /** Shares of all hands (0..1). */
  raise: number;
  /** Calls, or limps when first in. */
  call: number;
  fold: number;
  firstIn: boolean;
}

const PREFLOP_SPOTS: { label: string; scenario: Scenario; position: string }[] = [
  { label: 'First in, early position', scenario: 'RFI', position: 'UTG+1' },
  { label: 'First in, cutoff', scenario: 'RFI', position: 'CO' },
  { label: 'Over one or more limpers, button', scenario: 'vs Limp', position: 'BTN' },
  { label: 'Big blind vs a button open', scenario: 'vs RFI BTN', position: 'BB' },
];

export function preflopPreview(style: PreflopStyle, charts: readonly ChartChoice[]): PreflopRow[] {
  return PREFLOP_SPOTS.map((spot) => {
    const chart = pickChart(charts, spot.scenario, spot.position, 100);
    const firstIn = spot.scenario === 'RFI';
    let raise = 0;
    let call = 0;
    for (let c = 0; c < CELLS; c++) {
      const m = bendMix(chart, c, style, firstIn);
      const n = comboCount(c) / 1326;
      raise += n * (m.raise + m.allin);
      call += n * m.call;
    }
    return { label: spot.label, raise, call, fold: Math.max(0, 1 - raise - call), firstIn };
  });
}

// ---- after the flop ------------------------------------------------------------------------------

const BTN = '22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo';
const BB = '22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o';

export interface PostflopRow {
  label: string;
  /** What the share means, e.g. "calls" or "bets". */
  what: string;
  share: number;
  /** Optional split of the whole range: fold / call / raise, or check / bet. */
  split?: { label: string; share: number }[];
}

const POT = 550;
const STACK = 9700;

const spot = (board: string, p: Partial<Situation>): Situation => ({
  board: parseCards(board.split(' ')),
  pot: POT,
  toCall: 0,
  stack: STACK,
  oppStack: STACK,
  bb: 100,
  inPosition: false,
  ...p,
});

/** Weighted share of some option kinds among the combos of some buckets (all buckets if none given). */
function share(d: Decision, range: Float32Array, board: Situation['board'], kinds: OptionKind[], buckets?: Bucket[]): number {
  const b = buckets ? bucketAll(board) : null;
  let w = 0;
  let x = 0;
  for (let c = 0; c < 1326; c++) {
    if (!(range[c]! > 0) || Number.isNaN(d.probs[0]![c]!)) continue;
    if (b && !buckets!.includes(b[c] as Bucket)) continue;
    w += range[c]!;
    d.options.forEach((o, i) => {
      if (kinds.includes(o.kind)) x += range[c]! * d.probs[i]![c]!;
    });
  }
  return w > 0 ? x / w : 0;
}

let ranges: { btn: Float32Array; bb: Float32Array } | null = null;
const rangesOnce = () => (ranges ??= { btn: parseRange(BTN), bb: parseRange(BB) });

export const POSTFLOP_SPOTS = ['cbet-faced', 'cbet', 'barrel', 'lead', 'river-call', 'river-bluff'] as const;
export type PostflopSpot = (typeof POSTFLOP_SPOTS)[number];

/** One postflop spot through the motive model (0.1-1 s on the flop, fast on the river). */
export function postflopRow(p: MotiveProfile, which: PostflopSpot): PostflopRow {
  const { btn, bb } = rangesOnce();
  switch (which) {
    case 'cbet-faced': {
      const s = spot('Js 9d 2s', { toCall: POT / 2, oppStack: STACK - POT / 2 });
      const d = decide(p, s, bb, btn);
      return {
        label: 'Big blind vs a half-pot c-bet on J♠9♦2♠',
        what: 'continues',
        share: share(d, bb, s.board, ['call', 'raise']),
        split: [
          { label: 'Fold', share: share(d, bb, s.board, ['fold']) },
          { label: 'Call', share: share(d, bb, s.board, ['call']) },
          { label: 'Raise', share: share(d, bb, s.board, ['raise']) },
        ],
      };
    }
    case 'cbet': {
      const s = spot('Ac 7d 2h', { inPosition: true, initiative: true });
      const d = decide(p, s, btn, bb);
      return { label: 'Button c-bets A♣7♦2♥ when checked to', what: 'bets', share: share(d, btn, s.board, ['bet']) };
    }
    case 'barrel': {
      const s = spot('Ac 7d 2h 9s', { pot: 1100, stack: 9150, oppStack: 9150, inPosition: true, initiative: true });
      const d = decide(p, s, btn, bb);
      return { label: 'Button bets the turn again (A♣7♦2♥ 9♠) when checked to', what: 'barrels', share: share(d, btn, s.board, ['bet']) };
    }
    case 'lead': {
      const s = spot('8h 7h 3c', { oppInitiative: true });
      const d = decide(p, s, bb, btn);
      return {
        label: 'Big blind first to act on 8♥7♥3♣ after calling',
        what: 'leads with two pair or better',
        share: share(d, bb, s.board, ['bet'], ['cpfs', 'thick']),
      };
    }
    case 'river-call': {
      const s = spot('Kd 8c 4h 2s Ts', { pot: 2000, toCall: 2000, stack: 8000, oppStack: 6000 });
      const d = decide(p, s, bb, btn);
      return {
        label: 'River K♦8♣4♥2♠T♠, facing a pot-size bet',
        what: 'calls with one pair (thin value or showdown value)',
        share: share(d, bb, s.board, ['call', 'raise'], ['thin', 'sdv']),
      };
    }
    case 'river-bluff': {
      const s = spot('Kd 8c 4h 2s Ts', { pot: 2000, stack: 8000, oppStack: 8000, inPosition: true });
      const d = decide(p, s, btn, bb);
      return {
        label: 'River K♦8♣4♥2♠T♠, checked to, in position',
        what: 'bets with air (bluffs)',
        share: share(d, btn, s.board, ['bet'], ['air', 'weak-draw', 'strong-draw']),
      };
    }
  }
}
