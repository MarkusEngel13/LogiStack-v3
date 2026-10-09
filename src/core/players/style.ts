/**
 * Player styles in poker words: six sliders from 1 to 5 (half steps allowed), a sizing habit and
 * two specials. They are the easy face of the motive model - each slider moves one or two of the
 * hidden weights in profile.ts and the preflop style in preflop.ts - so a real player is "a type,
 * nudged": Dan = Fish, but Bluffs 3 and leads into the raiser.
 *
 * The scale is centred: 3 = plays the price (the NEUTRAL profile's value, the Reg chart's width
 * and raising; Bluffs is calibrated on frequencies instead, see MAP), below 3 = less of it, above = more. So the number is the exploit: Bluffs 2 = fold
 * more to his bets, Sticky 4 = value-bet him thin and don't bluff him.
 *
 * What the sliders don't cover comes from the base type: noise, size errors, hand reading, fear of
 * draws, trapping, loss aversion, comfort with big pots, open sizes. A slider left at its type's
 * position keeps the type's own value exactly, so "Fish with Bluffs 3" is a Fish in everything else.
 */

import type { MotiveProfile } from '../motives/profile';
import type { PreflopStyle } from '../motives/preflop';

export const SLIDERS = ['loose', 'pfAggr', 'postAggr', 'cbet', 'sticky', 'respect', 'bluffs'] as const;
export type SliderId = (typeof SLIDERS)[number];
export type Sliders = Record<SliderId, number>;

/** The usual bet sizes after the flop. */
export type Sizing = 'type' | 'half' | 'small' | 'payoff' | 'big';

export interface StyleSettings {
  /** The built-in type the rest comes from: 'Fish', 'Reg', ... */
  base: string;
  sliders: Sliders;
  sizing: Sizing;
  /** Limps premiums first in to re-raise (the limp-reraise trap). */
  limpTrap: boolean;
  /** Leads into the preflop raiser with strong hands instead of checking to him. */
  leads: boolean;
  /** His open-raise size in big blinds (2 = min-raise); unset = his type's usual mix. */
  openBB?: number;
}

/** What a seat carries in a hand: the style as it was when the hand was set up. */
export interface SeatStyle {
  /** The name shown: the player's or the profile's. */
  label: string;
  playerId?: string;
  profileId?: string;
  settings: StyleSettings;
}

// ---- what each slider means -------------------------------------------------------------------

export interface SliderInfo {
  id: SliderId;
  label: string;
  /** One line: what it measures. */
  what: string;
  /** What you see at the table at 1, 2, 3, 4 and 5. */
  steps: [string, string, string, string, string];
  /** The model weights it moves, for the "under the hood" line. */
  moves: string;
}

export const SLIDER_INFO: Record<SliderId, SliderInfo> = {
  loose: {
    id: 'loose',
    label: 'Loose',
    what: 'How many hands he plays before the flop.',
    steps: [
      'Only premiums and strong hands; folds most of the time',
      'A little tighter than a solid player',
      'A solid player: the reg charts',
      'Plays a lot of extra hands: weak aces, suited junk, any pair',
      'Plays almost anything, any two suited, any ace',
    ],
    moves: 'range width against the reg charts',
  },
  pfAggr: {
    id: 'pfAggr',
    label: 'Preflop aggression',
    what: 'Limps and calls, or raises and 3-bets.',
    steps: [
      'Limps almost everything, raises only the very best hands',
      'Limps a lot, calls raises, 3-bets rarely',
      'Raises when he plays first in, 3-bets as the charts do',
      'Raises more than the charts, 3-bets light',
      'Raises and re-raises everything he plays',
    ],
    moves: 'raise share against the charts, limp share when first in',
  },
  postAggr: {
    id: 'postAggr',
    label: 'Postflop aggression',
    what: 'Bets, barrels and raises after the flop.',
    steps: [
      'Checks and calls; bets only the nuts',
      'Passive: c-bets less, rarely barrels or raises',
      'Bets when it pays',
      'Bets and barrels a lot, raises draws',
      'Bets and raises almost every time',
    ],
    moves: 'liking for betting and raising (aggression)',
  },
  cbet: {
    id: 'cbet',
    label: 'C-bets',
    what: 'Bets again when he raised before: the flop, then the turn and river.',
    steps: [
      'Gives up unless he hits: c-bets about a fifth of flops',
      'C-bets less than half the flops, rarely the turn',
      'C-bets most flops, the turn sometimes',
      'C-bets almost every flop, often the turn',
      'Bets every street with the initiative: flop, turn and river',
    ],
    moves: 'c-bet habit (liking for betting again with the initiative), on top of his type’s',
  },
  sticky: {
    id: 'sticky',
    label: 'Sticky',
    what: 'How hard he is to get off a hand.',
    steps: [
      'Folds to almost any bet without a strong hand',
      'Folds a bit too easily',
      'Calls when the price is right',
      'Calls down top pair against two barrels; hates folding',
      'Calls with any pair or draw, whatever the size',
    ],
    moves: 'liking for calling (stickiness)',
  },
  respect: {
    id: 'respect',
    label: 'Respects big bets',
    what: 'Whether a big turn or river bet scares him off.',
    steps: [
      'Big bets look like bluffs to him: he calls more',
      'Size barely matters to him',
      'Reads the size as much as it says',
      'Folds one pair to a big turn or river bet',
      'A big river bet always means the nuts to him',
    ],
    moves: 'respect for bets from ¾ pot up (respect)',
  },
  bluffs: {
    id: 'bluffs',
    label: 'Bluffs',
    what: 'How often his aggression is air.',
    steps: [
      'Never bluffs: every bet is a hand',
      'Underbluffs, like most live players',
      'Bluffs about as much as it pays',
      'Bluffs too much, especially when checked to',
      'Bluffs whenever he senses weakness',
    ],
    moves: 'embarrassment of a caught bluff, how much he thinks others fold (foldBelief)',
  },
};

export const SIZING_INFO: Record<Sizing, { label: string; what: string }> = {
  type: { label: 'As his type', what: "The base type's usual sizes." },
  half: { label: 'Always half pot', what: 'Half pot on every street, whatever the hand; raises 3x. The autopilot reg.' },
  small: { label: 'Small', what: 'About a third of the pot; sizes up only with the nuts.' },
  payoff: { label: 'By hand strength', what: 'Picks the size that pays most: big with value, small with thin hands. A size tell.' },
  big: { label: 'Big', what: 'Three quarters to pot, more on the river.' },
};

// ---- the mapping --------------------------------------------------------------------------------

/**
 * Each knob's value at slider 1, 2, 3, 4 and 5; half steps are linear in between.
 *
 * Bluffs is calibrated on what you see, not on the neutral profile: with no embarrassment at all
 * the model bluffs ~90 % of its air when checked to on the river (players believe folds), so 3
 * would be a maniac. Instead (readout spot, Reg base): 1 ≈ never, 2 ≈ 5 %, 3 ≈ a quarter of his
 * air, 4 ≈ half, 5 ≈ 80 %. Calibrated 2026-10-08.
 */
const MAP = {
  width: [0.6, 0.8, 1, 1.7, 6],
  raises: [0.35, 0.65, 1, 1.3, 1.8],
  limp: [0.75, 0.35, 0, 0, 0],
  threeBet: [0.06, 0.3, 1, 1.3, 1.8],
  premiumCall: [0.3, 0.15, 0, 0, 0],
  aggression: [-0.05, -0.02, 0, 0.07, 0.2],
  stickiness: [-0.04, -0.02, 0, 0.06, 0.15],
  respect: [-0.3, -0.1, 0, 0.35, 0.6],
  embarrassment: [2, 1, 0.65, 0.4, 0.12],
  foldBelief: [0.85, 0.95, 1, 1.1, 1.25],
  /** Added to the type's own c-bet habit (relative, see styleMotives): Reg base 1 ≈ 20 % flop / 5 % turn, 3 ≈ 65 / 35, 5 ≈ 90+ / 100; at 5 the habit outweighs the urge to check back and trap. */
  cbetHabit: [-0.1, 0, 0.12, 0.3, 1.1],
} as const;

/** A knob's value at slider position v (1..5). */
export function at(knob: keyof typeof MAP, v: number): number {
  const t = MAP[knob];
  const x = Math.max(1, Math.min(5, v)) - 1;
  const i = Math.min(3, Math.floor(x));
  return t[i]! + (t[i + 1]! - t[i]!) * (x - i);
}

/** Where each built-in type sits on the sliders (from its preset's weights, rounded to halves). */
export const TYPE_SLIDERS: Record<string, Sliders> = {
  Reg: { loose: 3, pfAggr: 3, postAggr: 3.5, cbet: 3, sticky: 3, respect: 4, bluffs: 1.5 },
  TAG: { loose: 3, pfAggr: 3.5, postAggr: 3.5, cbet: 3.5, sticky: 3, respect: 4, bluffs: 2 },
  LAG: { loose: 3.5, pfAggr: 4, postAggr: 4, cbet: 4.5, sticky: 3.5, respect: 3.5, bluffs: 4.5 },
  Nit: { loose: 1.5, pfAggr: 2.5, postAggr: 1.5, cbet: 2.5, sticky: 2, respect: 5, bluffs: 1 },
  Fish: { loose: 4, pfAggr: 1, postAggr: 2, cbet: 2.5, sticky: 4, respect: 4, bluffs: 1.5 },
  Whale: { loose: 4, pfAggr: 1.5, postAggr: 1.5, cbet: 3, sticky: 5, respect: 2, bluffs: 1.5 },
  Maniac: { loose: 4, pfAggr: 5, postAggr: 5, cbet: 5, sticky: 4, respect: 1, bluffs: 5 },
};
TYPE_SLIDERS.Unknown = { ...TYPE_SLIDERS.Reg! };

export const BASE_TYPES = ['Unknown', 'Reg', 'TAG', 'LAG', 'Nit', 'Fish', 'Whale', 'Maniac'] as const;

/** A type's own settings: its slider positions, its sizes, no specials. */
export function typeSettings(base: string): StyleSettings {
  return { base, sliders: { ...(TYPE_SLIDERS[base] ?? TYPE_SLIDERS.Unknown!) }, sizing: 'type', limpTrap: false, leads: false };
}

/** Sliders that differ from the base type's positions. */
export function movedSliders(s: StyleSettings): SliderId[] {
  const home = TYPE_SLIDERS[s.base] ?? TYPE_SLIDERS.Unknown!;
  // a slider missing from older saved settings (C-bets came later) sits at its type's position
  return SLIDERS.filter((id) => s.sliders[id] !== undefined && Math.abs(s.sliders[id] - home[id]) > 1e-9);
}

/** Settings with every slider present: one missing from older saved data sits at its type's position. */
export function complete(s: StyleSettings): StyleSettings {
  const home = TYPE_SLIDERS[s.base] ?? TYPE_SLIDERS.Unknown!;
  if (SLIDERS.every((id) => s.sliders[id] !== undefined)) return s;
  return { ...s, sliders: Object.fromEntries(SLIDERS.map((id) => [id, s.sliders[id] ?? home[id]])) as Sliders };
}

const SIZES: Record<Exclude<Sizing, 'type'>, Pick<MotiveProfile, 'betHabit' | 'raiseHabit' | 'habit' | 'habitRiver'>> = {
  half: { betHabit: [0.5, 0.5, 0.5], raiseHabit: 3, habit: 0.6, habitRiver: 1 },
  small: { betHabit: [0.33, 0.33, 0.4], raiseHabit: 2.5, habit: 0.25, habitRiver: 1 },
  payoff: { betHabit: [0, 0, 0], raiseHabit: 0, habit: 0, habitRiver: 1 },
  big: { betHabit: [0.75, 0.75, 1], raiseHabit: 3, habit: 0.3, habitRiver: 1 },
};

/** How much a donk-leader expects the raiser to bet when checked to (decide.ts default: 0.6). */
const LEADER_EXPECTS = 0.25;

/**
 * The motive profile for a style: the base type's preset, with every moved slider's weights
 * replaced by the slider's values. `presets` = profile.ts's MOTIVE_PRESETS (passed in to keep
 * the modules apart).
 */
export function styleMotives(s: StyleSettings, presets: Record<string, MotiveProfile>, name = s.base): MotiveProfile {
  const base = presets[s.base] ?? presets.Unknown!;
  const moved = new Set(movedSliders(s));
  const v = s.sliders;
  const q: MotiveProfile = { ...base, name };
  if (moved.has('postAggr')) q.aggression = at('aggression', v.postAggr);
  // C-bets is relative to the type: its own habit, plus the step from its position (the same
  // habit makes a Reg c-bet 64 % and a Nit 26 %, so absolute values would jump on a first nudge)
  if (moved.has('cbet')) {
    const home = (TYPE_SLIDERS[s.base] ?? TYPE_SLIDERS.Unknown!).cbet;
    q.cbetHabit = (base.cbetHabit ?? 0) + at('cbetHabit', v.cbet) - at('cbetHabit', home);
  }
  if (moved.has('sticky')) q.stickiness = at('stickiness', v.sticky);
  if (moved.has('respect')) q.respect = at('respect', v.respect);
  if (moved.has('bluffs')) {
    q.embarrassment = at('embarrassment', v.bluffs);
    q.foldBelief = at('foldBelief', v.bluffs);
  }
  if (s.sizing !== 'type') Object.assign(q, SIZES[s.sizing]);
  if (s.leads) q.expectsBet = LEADER_EXPECTS;
  return q;
}

/** The preflop style for a style: the base type's, with moved sliders replaced. */
export function stylePreflop(s: StyleSettings, styles: Record<string, PreflopStyle>): PreflopStyle {
  const base = styles[s.base] ?? styles.Reg!;
  const moved = new Set(movedSliders(s));
  const q: PreflopStyle = { ...base };
  if (moved.has('loose')) q.width = at('width', s.sliders.loose);
  if (moved.has('pfAggr')) {
    q.raises = at('raises', s.sliders.pfAggr);
    q.limp = at('limp', s.sliders.pfAggr);
    q.threeBet = at('threeBet', s.sliders.pfAggr);
    q.premiumCall = at('premiumCall', s.sliders.pfAggr);
  }
  if (s.limpTrap) q.limpTrap = 0.5;
  return q;
}

/** The step label nearest a slider value (for half steps: the lower one, "…-ish"). */
export function stepLabel(id: SliderId, v: number): string {
  const steps = SLIDER_INFO[id].steps;
  const i = Math.max(0, Math.min(4, Math.round(v) - 1));
  return steps[i]!;
}
