/**
 * Read the player:
 *   1 His stack   - how he keeps his chips: neat towers by colour, a nervous wall, a messy pile
 *   2 His numbers - a tracker's numbers over a few hundred hands: VPIP, PFR, 3-bet, aggression
 *
 * The stack habits are v2's (a soft read: back it up with how he plays). The numbers are typical
 * live 9-handed values for each type, with some noise.
 */

import { makeChips, stackBB, stackUp, STYLE_OF_TYPE, type ChipSet, type StackStyle } from './stack';
import { between, newId, pick, shuffled, type Question, type Rand } from './types';

const TYPES = Object.keys(STYLE_OF_TYPE);

const STYLE_TEXT: Record<StackStyle, string> = {
  neat: 'tall, even towers of one colour each, the big chips in front: he counts his money and thinks in big blinds',
  human: 'mostly sorted, a few mixed towers and loose chips: an ordinary player',
  nervous: 'many low, uneven towers, chips moved around: worried about losing them, plays scared',
  slob: 'a mixed pile, chips everywhere: money means little to him, he gambles',
};

/** Typical live numbers per type: VPIP, PFR, 3-bet, aggression factor. */
export const TYPE_NUMBERS: Record<string, { vpip: number; pfr: number; threeBet: number; af: number; family: string }> = {
  Nit: { vpip: 12, pfr: 9, threeBet: 3, af: 2, family: 'tight-passive' },
  'Weak-tight rec': { vpip: 17, pfr: 6, threeBet: 2, af: 1, family: 'tight-passive' },
  Reg: { vpip: 20, pfr: 16, threeBet: 6, af: 2.5, family: 'tight-aggressive' },
  TAG: { vpip: 22, pfr: 18, threeBet: 7, af: 3, family: 'tight-aggressive' },
  LAG: { vpip: 31, pfr: 25, threeBet: 10, af: 3.5, family: 'loose-aggressive' },
  Maniac: { vpip: 50, pfr: 38, threeBet: 16, af: 5, family: 'loose-aggressive' },
  Fish: { vpip: 42, pfr: 9, threeBet: 3, af: 1.2, family: 'loose-passive' },
  Whale: { vpip: 62, pfr: 6, threeBet: 2, af: 0.8, family: 'loose-passive' },
};

function stackRead(set: ChipSet, level: number, rand: Rand): Question {
  for (let guard = 0; guard < 50; guard++) {
    const who = pick(rand, TYPES);
    const style = pick(rand, STYLE_OF_TYPE[who]!);
    const fits = (t: string) => STYLE_OF_TYPE[t]!.includes(style);
    const others = shuffled(
      rand,
      TYPES.filter((t) => !fits(t)),
    ).slice(0, 3);
    if (others.length < 2) continue;
    const chips = makeChips(set, stackBB(rand) * set.blinds.bb, rand);
    const scene = stackUp(chips, style, rand);
    const choices = shuffled(rand, [who, ...others]).map((t) => ({ id: t, label: t }));
    const alsoFits = TYPES.filter((t) => fits(t) && t !== who);
    return {
      id: newId(rand),
      quiz: 'reads',
      level,
      type: 'stack-style',
      prompt: 'A new player sits down. From his stack, which of these is he most likely?',
      data: { chips: set.chips, scenes: [scene], style },
      money: set.currency,
      choices,
      answer: { kind: 'choice', id: who },
      explain: `This is a ${style} stack: ${STYLE_TEXT[style]}. Of these, it fits ${who}${alsoFits.length ? ` (it could also be ${alsoFits.join(', ')})` : ''}. A first read only: confirm it with the hands he plays.`,
    };
  }
  throw new Error('no stack read found');
}

function numbersRead(level: number, rand: Rand): Question {
  const who = pick(rand, TYPES);
  const t = TYPE_NUMBERS[who]!;
  const noise = (x: number, k: number) => Math.max(0, Math.round(x + (rand() * 2 - 1) * k));
  const hands = between(rand, 150, 600);
  const stats = {
    hands,
    vpip: noise(t.vpip, 3),
    pfr: Math.min(noise(t.pfr, 2), noise(t.vpip, 3)),
    threeBet: noise(t.threeBet, 1),
    af: Math.max(0.3, Math.round((t.af + (rand() * 2 - 1) * 0.4) * 10) / 10),
  };
  // the others from other families, so there is one right answer
  const others = shuffled(
    rand,
    TYPES.filter((x) => TYPE_NUMBERS[x]!.family !== t.family),
  );
  const picked: string[] = [];
  for (const x of others) if (picked.length < 3 && !picked.some((p) => TYPE_NUMBERS[p]!.family === TYPE_NUMBERS[x]!.family)) picked.push(x);
  const choices = shuffled(rand, [who, ...picked]).map((x) => ({ id: x, label: x }));
  const loose = t.vpip >= 28 ? 'loose (plays many hands)' : 'tight (plays few hands)';
  const aggr = t.pfr / t.vpip >= 0.6 ? 'aggressive (raises most hands he plays)' : 'passive (calls more than he raises)';
  return {
    id: newId(rand),
    quiz: 'reads',
    level,
    type: 'numbers',
    prompt: `Your notes over ${hands} hands: VPIP ${stats.vpip} %, PFR ${stats.pfr} %, 3-bet ${stats.threeBet} %, aggression ${stats.af}. What is he?`,
    data: { stats },
    choices,
    answer: { kind: 'choice', id: who },
    explain: `VPIP ${stats.vpip} %: ${loose}. PFR ${stats.pfr} % of ${stats.vpip} %: ${aggr}. A typical ${who} (live): VPIP ${t.vpip}, PFR ${t.pfr}, 3-bet ${t.threeBet}, aggression ${t.af}. The gap between VPIP and PFR is the quickest tell: a big gap means a caller.`,
  };
}

export function readsQuestion(set: ChipSet, level: number, rand: Rand): Question {
  return level <= 1 ? stackRead(set, level, rand) : numbersRead(level, rand);
}

