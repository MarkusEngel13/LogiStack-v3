/**
 * Quizzes (the Gym): short questions that train what you need at the table - counting a stack at
 * a glance, the maths of a pot, charts, draws and combos. Every question is plain data (it is
 * stored: missed ones come back later, and the day's set is kept), made by a generator from a
 * random number source, graded by `grade`.
 */

export const QUIZZES = ['stack', 'maths', 'ranges', 'draws'] as const;
export type QuizId = (typeof QUIZZES)[number];

export const QUIZ_INFO: Record<QuizId, { name: string; what: string; levels: number; levelNames: string[] }> = {
  stack: {
    name: 'Guess the stack',
    what: 'Count a stack at a glance, spot the dirty stack, read the pot.',
    levels: 5,
    levelNames: ['Rookie: neat towers', 'Grinder: real stacks', 'Shark: dirty stacks', 'Pro: the pot and its odds', 'Wizard: geometric bets'],
  },
  maths: {
    name: 'Table maths',
    what: 'Pot odds, bet and raise sizes, SPR, side pots.',
    levels: 3,
    levelNames: ['Pot odds and sizes', 'Raises and SPR', 'Side pots and geometric bets'],
  },
  ranges: {
    name: 'Ranges',
    what: 'Is the hand in the chart? Who is ahead, and by how much?',
    levels: 3,
    levelNames: ['Opening charts', 'Facing an open', 'Equity on the flop'],
  },
  draws: {
    name: 'Draws and combos',
    what: 'Count your outs, the draws on a board, the combos left.',
    levels: 3,
    levelNames: ['Outs', 'Draws on the board', 'Combos with blockers'],
  },
};

/** What the answer looks like. */
export type Answer =
  /** One of the choices (by id). */
  | { kind: 'choice'; id: string }
  /** Several choices (all of them, no more). */
  | { kind: 'multi'; ids: string[] }
  /** A number, right within `tolerance` (absolute) or `relative` (share of the answer). */
  | { kind: 'number'; value: number; tolerance?: number; relative?: number };

export interface Question {
  id: string;
  quiz: QuizId;
  level: number;
  /** The kind of question within the quiz ("count", "pot-odds", "outs", ...). */
  type: string;
  prompt: string;
  /** What the screen draws: depends on the type (a stack, cards, a board...). Plain data. */
  data: Record<string, unknown>;
  answer: Answer;
  choices?: { id: string; label: string }[];
  /** Shown next to a number input: "€", "%", "outs". */
  unit?: string;
  /** How a number is entered and shown: money in minor units of the question's currency. */
  money?: { code: string; minorPerMajor: number };
  /** Why the answer is what it is, shown after answering. */
  explain: string;
}

/** What you answered. */
export type Given = { kind: 'choice'; id: string } | { kind: 'multi'; ids: string[] } | { kind: 'number'; value: number };

export interface Grade {
  correct: boolean;
  /** For numbers: how far off, as a share of the answer (0.05 = 5 %). */
  error?: number;
}

export function grade(q: Question, given: Given): Grade {
  const a = q.answer;
  if (a.kind === 'choice') return { correct: given.kind === 'choice' && given.id === a.id };
  if (a.kind === 'multi') {
    if (given.kind !== 'multi') return { correct: false };
    const want = new Set(a.ids);
    const got = new Set(given.ids);
    return { correct: want.size === got.size && [...want].every((x) => got.has(x)) };
  }
  if (given.kind !== 'number' || !Number.isFinite(given.value)) return { correct: false };
  const diff = Math.abs(given.value - a.value);
  const error = a.value !== 0 ? diff / Math.abs(a.value) : diff;
  const ok = diff <= (a.tolerance ?? 0) + 1e-9 || (a.relative !== undefined && error <= a.relative + 1e-9);
  return { correct: ok, error };
}

/** A random number source (0 <= x < 1). */
export type Rand = () => number;

export const pick = <T>(rand: Rand, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
export const between = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

/** Seeded random numbers (mulberry32), for tests and for a day's set that is the same on every device. */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newId = (rand: Rand) => Math.floor(rand() * 2 ** 32).toString(36) + Math.floor(rand() * 2 ** 32).toString(36);

/** Shuffles a copy. */
export function shuffled<T>(rand: Rand, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
