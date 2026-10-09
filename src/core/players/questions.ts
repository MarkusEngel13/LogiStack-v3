/**
 * The question wizard behind "Ask me questions": what you have seen a player do, turned into
 * slider positions. Each answer sets one slider (or a special); "Don't know" leaves it where the
 * starting profile has it. The questions are about things you can see at the table, so answering
 * them is also practice in what to look for.
 *
 * How many hands he plays depends on how many sit at the table: 25 % is loose nine-handed and
 * normal six-handed. So the answer is a share of hands, and the Loose slider is the one whose
 * charts (preflop.ts's bendMix, the same the bots use) play that share at your table size.
 */

import { bendMix, type PreflopStyle } from '../motives/preflop';
import { CELLS, comboCount } from '../ranges/hands';
import { TEN_MAX_POSITIONS } from '../ranges/library';
import { pickChart, type ChartChoice } from '../ranges/spot';
import { at, SLIDERS, type SliderId, type Sizing, type StyleSettings } from './style';

// ---- how many hands he plays, at a given table size ------------------------------------------------

/** The 10-max chart positions of an n-handed table (n = 2..10). */
export function tablePositions(n: number): string[] {
  const open = TEN_MAX_POSITIONS.slice(0, 8); // UTG .. BTN
  return [...open.slice(Math.max(0, 8 - (n - 2))), 'SB', 'BB'].slice(-n);
}

/**
 * Being first in is the loosest case: often someone has raised already and he folds more. Scaled
 * so a solid reg plays what trackers show (VPIP about 19 % nine-handed, 24 % six-handed).
 */
const NOT_ALWAYS_FIRST = 0.66;

/**
 * About how many hands a style plays (puts money in by choice, VPIP) at an n-handed table: the
 * share it plays first in from each seat, and from the big blind against a button open, averaged
 * over the seats and scaled down by NOT_ALWAYS_FIRST.
 */
export function handsPlayed(style: PreflopStyle, charts: readonly ChartChoice[], n: number): number {
  let sum = 0;
  const seats = tablePositions(n);
  for (const pos of seats) {
    const firstIn = pos !== 'BB';
    const chart = firstIn ? pickChart(charts, 'RFI', pos, 100) : pickChart(charts, 'vs RFI BTN', 'BB', 100);
    let go = 0;
    for (let c = 0; c < CELLS; c++) go += (comboCount(c) / 1326) * bendMix(chart, c, style, firstIn).go;
    sum += go;
  }
  // the looser he is, the less it matters whether someone raised first: a player in nearly every
  // hand calls raises with them too (without this, nobody could be estimated above ~60 %)
  const go = sum / seats.length;
  return go * (NOT_ALWAYS_FIRST + (1 - NOT_ALWAYS_FIRST) * go * go);
}

/** The Loose position (1..5, half steps) that plays `share` of hands at an n-handed table. */
export function looseFor(share: number, base: PreflopStyle, charts: readonly ChartChoice[], n: number): number {
  let best = 3;
  let bestErr = Infinity;
  for (let v = 1; v <= 5; v += 0.5) {
    const err = Math.abs(handsPlayed({ ...base, width: at('width', v) }, charts, n) - share);
    if (err < bestErr) {
      best = v;
      bestErr = err;
    }
  }
  return best;
}

// ---- the questions ----------------------------------------------------------------------------------

export interface Option {
  id: string;
  label: string;
  /** A short hint under the label. */
  hint?: string;
}

export interface Question {
  id: string;
  /** What it sets, for the summary ("Loose", "Leads into the raiser"). */
  sets: string;
  text: string;
  help?: string;
  options: Option[];
}

export const TABLE_SIZES = [
  { id: '6', label: '6 or fewer', n: 6 },
  { id: '8', label: '7 or 8', n: 8 },
  { id: '9', label: '9 or 10', n: 9 },
] as const;

/** Share of hands for each "how many hands" answer (the band's middle). */
const HANDS: Record<string, number> = { few: 0.12, some: 0.2, many: 0.32, most: 0.5, all: 0.7 };

export const QUESTIONS: Question[] = [
  {
    id: 'table',
    sets: 'Table size',
    text: 'How many players usually sit at your table?',
    help: 'It changes what “plays a lot of hands” means: a quarter of the hands is loose nine-handed and normal six-handed.',
    options: TABLE_SIZES.map((t) => ({ id: t.id, label: t.label })),
  },
  {
    id: 'hands',
    sets: 'Loose',
    text: 'How many hands does he play?',
    help: 'Hands where he puts money in by choice: limps, calls or raises (posting a blind doesn’t count).',
    options: [
      { id: 'few', label: 'Very few', hint: '1 in 8 or fewer' },
      { id: 'some', label: 'Some', hint: 'about 1 in 5' },
      { id: 'many', label: 'Quite a lot', hint: 'about 1 in 3' },
      { id: 'most', label: 'Most of them', hint: 'about half' },
      { id: 'all', label: 'Almost every hand', hint: '6 in 10 or more' },
    ],
  },
  {
    id: 'firstIn',
    sets: 'Preflop aggression',
    text: 'When nobody has raised yet, does he limp or raise?',
    options: [
      { id: 'limp', label: 'Limps almost always', hint: 'raises only the very best hands' },
      { id: 'mix', label: 'A mix', hint: 'limps the weaker ones, raises the good ones' },
      { id: 'raise', label: 'Raises', hint: 'rarely or never limps' },
    ],
  },
  {
    id: 'open',
    sets: 'Raise size',
    text: 'When he raises first in, how big?',
    help: 'A min-raise is cheap to call - and often tells you something about his hand.',
    options: [
      { id: '2', label: 'Min-raise', hint: '2 BB' },
      { id: '3', label: '3 BB' },
      { id: '4', label: '4 BB' },
      { id: '5', label: '5 BB or more' },
    ],
  },
  {
    id: 'threeBet',
    sets: 'Preflop aggression',
    text: 'Does he 3-bet?',
    options: [
      { id: 'never', label: 'Never seen it', hint: 'or only with aces and kings' },
      { id: 'some', label: 'Sometimes' },
      { id: 'often', label: 'Often', hint: 'also with hands like suited connectors or weak aces' },
    ],
  },
  {
    id: 'limpTrap',
    sets: 'Limp-reraises premiums',
    text: 'Have you seen him limp and then re-raise when someone raised behind him?',
    options: [
      { id: 'yes', label: 'Yes', hint: 'the limp-reraise trap' },
      { id: 'no', label: 'No' },
    ],
  },
  {
    id: 'postflop',
    sets: 'Postflop aggression',
    text: 'After the flop, what does he mostly do?',
    options: [
      { id: 'passive', label: 'Checks and calls', hint: 'bets only very strong hands' },
      { id: 'fair', label: 'Bets when he has something' },
      { id: 'lots', label: 'Bets and barrels a lot', hint: 'raises draws too' },
      { id: 'always', label: 'Bets or raises almost every time' },
    ],
  },
  {
    id: 'cbet',
    sets: 'C-bets',
    text: 'When he raised before the flop and gets checked to, does he bet?',
    help: 'His c-bets and barrels, whatever he holds - some players never raise after the flop but bet every street with the initiative.',
    options: [
      { id: 'hits', label: 'Only when he hits', hint: 'checks back most flops' },
      { id: 'half', label: 'About half the time', hint: 'rarely bets the turn again' },
      { id: 'flop', label: 'Almost every flop', hint: 'the turn often, not always' },
      { id: 'every', label: 'Every street', hint: 'flop, turn and river' },
    ],
  },
  {
    id: 'leads',
    sets: 'Leads into the raiser',
    text: 'After calling a raise, does he bet first into the raiser (donk-bet)?',
    options: [
      { id: 'never', label: 'Never', hint: 'he checks to the raiser' },
      { id: 'strong', label: 'Yes, with strong hands' },
      { id: 'often', label: 'Yes, often' },
    ],
  },
  {
    id: 'sticky',
    sets: 'Sticky',
    text: 'He has top pair on a dry board (like K♠7♦2♣) and you bet the flop, the turn and the river. What does he do?',
    help: 'A dry board on purpose: with draws around, calling down means something else.',
    options: [
      { id: 'early', label: 'Folds by the turn' },
      { id: 'river', label: 'Calls the flop and the turn, folds the river' },
      { id: 'down', label: 'Calls it down' },
      { id: 'anything', label: 'Calls it down even with second pair' },
    ],
  },
  {
    id: 'respect',
    sets: 'Respects big bets',
    text: 'On the river he has one pair and faces a big bet (about pot size). What does he do?',
    options: [
      { id: 'calls', label: 'Calls “to see”', hint: 'big bets look like bluffs to him' },
      { id: 'depends', label: 'It depends', hint: 'on the board and the story' },
      { id: 'folds', label: 'Folds', hint: 'big river bets mean the nuts to him' },
    ],
  },
  {
    id: 'bluffs',
    sets: 'Bluffs',
    text: 'Have you seen him bluff the river?',
    help: 'A real bluff: a bet with a hand that couldn’t win at showdown.',
    options: [
      { id: 'never', label: 'Never' },
      { id: 'rarely', label: 'Once or twice' },
      { id: 'regularly', label: 'Regularly' },
      { id: 'lots', label: 'All the time' },
    ],
  },
  {
    id: 'sizing',
    sets: 'Bet sizes',
    text: 'How does he size his bets after the flop?',
    options: [
      { id: 'same', label: 'Always about half pot', hint: 'whatever he has' },
      { id: 'small', label: 'Small', hint: 'a third of the pot or less' },
      { id: 'strength', label: 'Bigger with strong hands', hint: 'the size gives his hand away' },
      { id: 'big', label: 'Big', hint: 'three quarters to pot' },
    ],
  },
];

/** "Don't know" is always offered and is the absence of an answer. */
export type Answers = Record<string, string>;

const SET: Record<string, Partial<Record<SliderId, number>>> = {
  'postflop:passive': { postAggr: 1.5 },
  'postflop:fair': { postAggr: 3 },
  'postflop:lots': { postAggr: 4 },
  'postflop:always': { postAggr: 5 },
  'cbet:hits': { cbet: 1 },
  'cbet:half': { cbet: 2 },
  'cbet:flop': { cbet: 4 },
  'cbet:every': { cbet: 5 },
  'sticky:early': { sticky: 1.5 },
  'sticky:river': { sticky: 3 },
  'sticky:down': { sticky: 4 },
  'sticky:anything': { sticky: 5 },
  'respect:calls': { respect: 1.5 },
  'respect:depends': { respect: 3 },
  'respect:folds': { respect: 4.5 },
  'bluffs:never': { bluffs: 1 },
  'bluffs:rarely': { bluffs: 2 },
  'bluffs:regularly': { bluffs: 3.5 },
  'bluffs:lots': { bluffs: 4.5 },
};
const SIZING: Record<string, Sizing> = { same: 'half', small: 'small', strength: 'payoff', big: 'big' };

/** The table-size answer for n players. */
export const tableSizeId = (n: number) => (n <= 6 ? '6' : n <= 8 ? '8' : '9');

export const tableSizeOf = (a: Answers) => TABLE_SIZES.find((t) => t.id === a.table)?.n ?? 9;

/**
 * The style the answers describe, starting from `start` (the profile picked, or the type): every
 * answered question moves its slider, the rest stay. `preflopOf` gives the preflop style of a
 * settings (style.ts's stylePreflop with the presets), for the hands-played inversion.
 */
export function applyAnswers(
  a: Answers,
  start: StyleSettings,
  charts: readonly ChartChoice[],
  preflopOf: (s: StyleSettings) => PreflopStyle,
): StyleSettings {
  const s: StyleSettings = { ...start, sliders: { ...start.sliders } };
  for (const [q, ans] of Object.entries(a)) Object.assign(s.sliders, SET[`${q}:${ans}`] ?? {});

  // preflop aggression: the first-in habit, adjusted by the 3-bets
  if (a.firstIn || a.threeBet) {
    const base = a.firstIn ? { limp: 1, mix: 2, raise: 3 }[a.firstIn]! : s.sliders.pfAggr;
    const adj = a.threeBet === 'often' ? (base >= 3 ? 1.5 : 1) : a.threeBet === 'never' && base >= 3 ? -0.5 : 0;
    s.sliders.pfAggr = Math.max(1, Math.min(5, base + adj));
  }
  if (a.limpTrap) s.limpTrap = a.limpTrap === 'yes';
  if (a.leads) s.leads = a.leads !== 'never';
  if (a.leads === 'often') s.sliders.postAggr = Math.min(5, Math.max(s.sliders.postAggr, 3.5));
  if (a.sizing && SIZING[a.sizing]) s.sizing = SIZING[a.sizing]!;
  if (a.open && Number(a.open) >= 2) s.openBB = Number(a.open);

  // how many hands, at his table size (only the width matters: limping or raising, he plays them)
  // "pct70" = a number you saw (70 % of hands); the named bands otherwise
  const share = a.hands?.startsWith('pct') ? Number(a.hands.slice(3)) / 100 : a.hands ? HANDS[a.hands] : undefined;
  if (share !== undefined) s.sliders.loose = looseFor(share, preflopOf(s), charts, tableSizeOf(a));
  return s;
}

/** The profile nearest a style (sum of slider distances), among `candidates`. */
export function nearest<T extends { settings: StyleSettings }>(s: StyleSettings, candidates: readonly T[]): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = SLIDERS.reduce((sum, id) => sum + Math.abs(c.settings.sliders[id] - s.sliders[id]), 0);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
