/**
 * Question versions. When an answer changes its meaning (questions.ts's QUESTIONS_VERSION goes
 * up), players saved on the old questions move to the new ones. A clean move happens by itself
 * (3 BB or 4 BB -> 3-4 BB); an ambiguous one ("5 BB or more": 5-6 or 7+?) waits for a review on
 * the Players page, where the best guess is one tap away. Either way his sliders move only by what
 * the new meaning changes, so what you tuned by hand stays; an answer you never gave stays unknown.
 *
 * Version 1 = the questions until 2026-10-10.
 */

import { answerLabel, FIRST_IN, LEADS, LIMP_TRAP, openBBOf, QUESTIONS_VERSION, SET, threeBetStep, type Answers } from './questions';
import { leadsLevel, limpTrapLevel, type StyleSettings } from './style';

/** An old answer the new questions can't map by themselves: asked in the review. */
export interface Ask {
  q: string;
  /** His answer, as given on the questions of version `from`. */
  old: string;
  from: number;
}

/**
 * Version 1 -> 2: what each changed answer may mean now. One = a clean move; more = asked, the
 * best guess first (the one with the same meaning, or with the old answer's words).
 */
const V1_TO_V2: Record<string, Record<string, string[]>> = {
  open: { '2': ['2'], '3': ['3-4'], '4': ['3-4'], '5': ['5-6', '7+'] },
  threeBet: { never: ['rarely', 'never'], some: ['some'], often: ['often'] },
  limpTrap: { yes: ['monster'], no: ['never'] },
  cbet: { hits: ['hits'], half: ['mixed', 'less'], flop: ['flop'], every: ['every'] },
  leads: { never: ['never'], strong: ['sometimes', 'rarely'], often: ['often'] },
};

/** Version-1 answers in words, where the words changed. */
const V1_LABELS: Record<string, string> = {
  'open:3': '3 BB',
  'open:4': '4 BB',
  'open:5': '5 BB or more',
  'threeBet:never': 'Never seen it (or only with aces and kings)',
  'limpTrap:yes': 'Yes',
  'limpTrap:no': 'No',
  'cbet:half': 'About half the time (rarely bets the turn again)',
  'leads:strong': 'Yes, with strong hands',
  'leads:often': 'Yes, often',
};

/** What version 1's answers set, where version 2 means something else. */
const V1_CBET: Record<string, number> = { hits: 1, half: 2, flop: 4, every: 5 };
const V1_TRAP: Record<string, number> = { yes: 1, no: 0 };
const V1_LEADS: Record<string, number> = { never: 0, strong: 2, often: 2 };
const v1ThreeBetStep = (base: number, a: string) => (a === 'often' ? (base >= 3 ? 1.5 : 1) : a === 'never' && base >= 3 ? -0.5 : 0);

/** An answer in words, as it was given (an old answer in its old words). */
export function oldAnswerLabel(q: string, a: string, from: number): string {
  return (from < 2 ? V1_LABELS[`${q}:${a}`] : undefined) ?? answerLabel(q, a);
}

/** The new answers an old one may mean, the best guess first. */
export function askOptions(ask: Ask): string[] {
  return (ask.from < 2 ? V1_TO_V2[ask.q]?.[ask.old] : undefined) ?? [];
}

/** His answers on the current questions: the clean moves made, the ambiguous ones to ask. */
export function upgradeAnswers(a: Answers, from: number): { answers: Answers; asks: Ask[] } {
  if (from >= QUESTIONS_VERSION) return { answers: a, asks: [] };
  const answers: Answers = {};
  const asks: Ask[] = [];
  for (const [q, old] of Object.entries(a)) {
    const to = V1_TO_V2[q]?.[old];
    // an unchanged question, or an answer told at the table ("pct70"): kept as it is
    if (!to) answers[q] = old;
    else if (to.length === 1) answers[q] = to[0]!;
    else asks.push({ q, old, from });
  }
  return { answers, asks };
}

const clamp = (v: number) => Math.max(1, Math.min(5, v));

/**
 * His settings after one answer moved from its old meaning (`old`, version `from`) to a current
 * answer (`now`): a slider moves by the difference between the two meanings, so a slider tuned by
 * hand keeps its tuning; a switch or the open size follows only while it still has what the old
 * answer set. `answers` = his current answers (the 3-bets need his first-in habit).
 */
export function moveAnswer(s: StyleSettings, q: string, old: string, now: string, answers: Answers, from: number): StyleSettings {
  if (from >= QUESTIONS_VERSION) return s;
  const out: StyleSettings = { ...s, sliders: { ...s.sliders } };
  switch (q) {
    case 'open': {
      const next = openBBOf(now);
      if (out.openBB === Number(old) && next) out.openBB = next;
      break;
    }
    case 'threeBet': {
      const base = FIRST_IN[answers.firstIn ?? ''] ?? out.sliders.pfAggr;
      out.sliders.pfAggr = clamp(out.sliders.pfAggr + threeBetStep(base, now) - v1ThreeBetStep(base, old));
      break;
    }
    case 'limpTrap': {
      const next = LIMP_TRAP[now];
      if (limpTrapLevel(out.limpTrap) === V1_TRAP[old] && next !== undefined) out.limpTrap = next;
      break;
    }
    case 'cbet': {
      const was = V1_CBET[old];
      const next = SET[`cbet:${now}`]?.cbet;
      if (was !== undefined && next !== undefined) out.sliders.cbet = clamp(out.sliders.cbet + next - was);
      break;
    }
    case 'leads': {
      const next = LEADS[now];
      if (leadsLevel(out.leads) === V1_LEADS[old] && next !== undefined) out.leads = next;
      // "often" also makes him aggressive after the flop (the old "often" did that already)
      if (now === 'often' && old !== 'often') out.sliders.postAggr = Math.min(5, Math.max(out.sliders.postAggr, 3.5));
      break;
    }
  }
  return out;
}

/**
 * A player's settings and answers moved to the current questions: the clean moves made; the
 * ambiguous answers left out of `answers` and returned as `asks`, his settings untouched by them.
 */
export function upgrade(s: StyleSettings, a: Answers, from: number): { settings: StyleSettings; answers: Answers; asks: Ask[] } {
  const { answers, asks } = upgradeAnswers(a, from);
  let settings = s;
  for (const [q, old] of Object.entries(a)) {
    if (answers[q] !== undefined) settings = moveAnswer(settings, q, old, answers[q]!, answers, from);
  }
  return { settings, answers, asks };
}
