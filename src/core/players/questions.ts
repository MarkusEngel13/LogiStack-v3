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
import { at, type Leads, type LimpTrap, type OpenTell, type SliderId, type Sizing, type StyleSettings } from './style';

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

/**
 * The questions' version: it goes up whenever an answer changes its meaning (an option split,
 * merged or renamed). Each saved player keeps the version his answers came from; versions.ts moves
 * old answers to the new questions. 2 = 2026-10-10: raise size bands and "raise size by hand",
 * 3-bets "very rarely", limp-reraise and donk-bet levels, the c-bet middle, Q7 without c-bets.
 */
export const QUESTIONS_VERSION = 2;

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
      { id: '3-4', label: '3-4 BB' },
      { id: '5-6', label: '5-6 BB' },
      { id: '7+', label: '7 BB or more' },
    ],
  },
  {
    id: 'openTell',
    sets: 'Raise size by hand',
    text: 'Does his raise size depend on his hand?',
    help: 'A live tell: some players raise bigger with their good hands, others raise small with their best ones.',
    options: [
      { id: 'no', label: 'No', hint: 'the same size whatever he has' },
      { id: 'strong', label: 'Bigger with strong hands' },
      { id: 'weak', label: 'Bigger with weak hands', hint: 'small with his best ones' },
    ],
  },
  {
    id: 'threeBet',
    sets: 'Preflop aggression',
    text: 'Does he 3-bet?',
    options: [
      { id: 'never', label: 'Never', hint: 'he just calls, even with aces' },
      { id: 'rarely', label: 'Very rarely', hint: 'QQ+, AK' },
      { id: 'some', label: 'Sometimes', hint: 'also JJ-TT, AQ' },
      { id: 'often', label: 'Often', hint: 'also suited connectors, weak aces' },
    ],
  },
  {
    id: 'limpTrap',
    sets: 'Limp-reraises',
    text: 'Have you seen him limp and then re-raise when someone raised behind him?',
    help: 'It tells you what his limps hold: if he never does it, his limps hold no big hands.',
    options: [
      { id: 'never', label: 'Never seen it', hint: 'his limps are capped: isolate wide and big' },
      { id: 'monster', label: 'Seen it, with a monster' },
      { id: 'often', label: 'Does it often', hint: 'weaker hands too: isolate tighter' },
    ],
  },
  {
    id: 'postflop',
    sets: 'Postflop aggression',
    text: 'When he did not raise before the flop, or you bet into him: does he bet and raise, or check and call?',
    help: 'Without the initiative. His c-bets are the next question: a passive player may still c-bet every flop.',
    options: [
      { id: 'passive', label: 'Checks and calls', hint: 'bets only very strong hands' },
      { id: 'fair', label: 'Average', hint: 'bets when he has something, sometimes a bluff' },
      { id: 'lots', label: 'Bets and raises a lot', hint: 'raises draws too' },
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
      { id: 'less', label: 'Less than half', hint: 'rarely bets the turn again' },
      { id: 'mixed', label: 'Mixed', hint: 'about half, no clear pattern' },
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
      { id: 'rarely', label: 'Rarely', hint: 'only monsters: believe his leads' },
      { id: 'sometimes', label: 'Sometimes', hint: 'strong hands and draws' },
      { id: 'often', label: 'Often', hint: 'any piece: raise his leads' },
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

/** The slider each answer sets (`question:answer`). */
export const SET: Record<string, Partial<Record<SliderId, number>>> = {
  'postflop:passive': { postAggr: 1.5 },
  'postflop:fair': { postAggr: 3 },
  'postflop:lots': { postAggr: 4 },
  'postflop:always': { postAggr: 5 },
  'cbet:hits': { cbet: 1 },
  'cbet:less': { cbet: 2 },
  'cbet:mixed': { cbet: 3 },
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

/** Preflop aggression from the first-in habit, before the 3-bets adjust it. */
export const FIRST_IN: Record<string, number> = { limp: 1, mix: 2, raise: 3 };

/**
 * How the 3-bets move Preflop aggression from the first-in habit: a raiser who 3-bets light sits
 * near the top, one who never 3-bets (he flats even aces) a step below the charts.
 */
export function threeBetStep(base: number, answer: string | undefined): number {
  switch (answer) {
    case 'never':
      return base >= 3 ? -1 : -0.5;
    case 'rarely':
      return base >= 3 ? -0.5 : 0;
    case 'often':
      return base >= 3 ? 1.5 : 1;
    default:
      return 0;
  }
}

export const LIMP_TRAP: Record<string, LimpTrap> = { never: 0, monster: 1, often: 2 };
export const LEADS: Record<string, Leads> = { never: 0, rarely: 1, sometimes: 2, often: 3 };
const OPEN_TELL: Record<string, OpenTell> = { no: 'no', strong: 'strong', weak: 'weak' };

/** What the raise-size bands open to: the bots' size for each (about the band's middle). */
const OPEN_BANDS: Record<string, number> = { '2': 2, '3-4': 3.5, '5-6': 5.5, '7+': 8 };

/** The open size an answer means, in big blinds: a band's size, or an exact size told at the table ("2.5"). */
export function openBBOf(answer: string | undefined): number | undefined {
  if (answer === undefined) return undefined;
  const band = OPEN_BANDS[answer];
  if (typeof band === 'number') return band;
  const n = Number(answer);
  return Number.isFinite(n) && n >= 2 ? n : undefined;
}

/** The band an open size falls in (the answer it is nearest to). */
export const openBand = (bb: number): string => (bb < 2.75 ? '2' : bb < 4.75 ? '3-4' : bb < 6.75 ? '5-6' : '7+');

/** The table-size answer for n players. */
export const tableSizeId = (n: number) => (n <= 6 ? '6' : n <= 8 ? '8' : '9');

export const tableSizeOf = (a: Answers) => TABLE_SIZES.find((t) => t.id === a.table)?.n ?? 9;

/** An answer in words: its option's label, or what was told at the table ("70 % of hands", "2.5 BB"). */
export function answerLabel(q: string, a: string): string {
  const option = QUESTIONS.find((x) => x.id === q)?.options.find((o) => o.id === a);
  if (option) return q === 'open' && option.hint ? `${option.label} (${option.hint})` : option.label;
  if (q === 'hands' && a.startsWith('pct')) return `${a.slice(3)} % of hands`;
  if (q === 'open' && openBBOf(a)) return `${a} BB`;
  return a;
}

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
    const base = FIRST_IN[a.firstIn ?? ''] ?? s.sliders.pfAggr;
    s.sliders.pfAggr = Math.max(1, Math.min(5, base + threeBetStep(base, a.threeBet)));
  }
  const trap = LIMP_TRAP[a.limpTrap ?? ''];
  if (typeof trap === 'number') s.limpTrap = trap;
  const leads = LEADS[a.leads ?? ''];
  if (typeof leads === 'number') s.leads = leads;
  if (a.leads === 'often') s.sliders.postAggr = Math.min(5, Math.max(s.sliders.postAggr, 3.5));
  if (a.sizing && SIZING[a.sizing]) s.sizing = SIZING[a.sizing]!;
  const open = openBBOf(a.open);
  if (open) s.openBB = open;
  const tell = OPEN_TELL[a.openTell ?? ''];
  if (typeof tell === 'string') s.openTell = tell;

  // how many hands, at his table size (only the width matters: limping or raising, he plays them)
  // "pct70" = a number you saw (70 % of hands); the named bands otherwise
  const share = a.hands?.startsWith('pct') ? Number(a.hands.slice(3)) / 100 : a.hands ? HANDS[a.hands] : undefined;
  if (share !== undefined) s.sliders.loose = looseFor(share, preflopOf(s), charts, tableSizeOf(a));
  return s;
}
