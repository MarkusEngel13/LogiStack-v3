/**
 * Table maths: the sums you do at the table, in your game's money.
 *   1 Pot odds and bet sizes  ("€0.80 to call into €2.40: what equity do you need?", "½ pot is?")
 *   2 Raises and SPR          ("3x over a bet of €0.75 is?", "pot-sized raise", "stack ÷ pot")
 *   3 Side pots, geometric    ("three all-ins: how big is the main pot?", "the bet to be all-in by the river")
 */

import { geometricBet } from './stack';
import { between, newId, pick, type Question, type Rand } from './types';

export interface MathsGame {
  currency: { code: string; minorPerMajor: number };
  blinds: { sb: number; bb: number };
}

const sym = (g: MathsGame) => (g.currency.code === 'EUR' ? '€' : g.currency.code === 'USD' ? '$' : g.currency.code === 'GBP' ? '£' : '');
const fmt = (g: MathsGame, v: number) => {
  const major = v / g.currency.minorPerMajor;
  return `${sym(g)}${Number.isInteger(major) ? major : major.toFixed(2)}`;
};
/** A round amount: whole chips of a fifth of the big blind (5 cents at 10/25). */
const round = (g: MathsGame, v: number) => {
  const unit = Math.max(1, Math.round(g.blinds.bb / 5));
  return Math.max(unit, Math.round(v / unit) * unit);
};

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [0.33, '⅓'],
  [0.5, '½'],
  [0.66, '⅔'],
  [0.75, '¾'],
  [1, 'pot'],
  [1.5, '1.5x pot'],
];

export function mathsQuestion(g: MathsGame, level: number, rand: Rand): Question {
  const id = newId(rand);
  const bb = g.blinds.bb;
  const base = { id, quiz: 'maths' as const, level };
  const pot = () => round(g, between(rand, 4, 60) * bb);
  const kind = level === 1 ? pick(rand, ['pot-odds', 'bet-size']) : level === 2 ? pick(rand, ['raise', 'pot-raise', 'spr']) : pick(rand, ['side-pot', 'geometric']);

  if (kind === 'pot-odds') {
    const p = pot();
    const [f, word] = pick(rand, FRACTIONS);
    const b = round(g, p * f);
    const need = (100 * b) / (p + 2 * b);
    return {
      ...base,
      type: kind,
      prompt: `The pot is ${fmt(g, p)}. He bets ${fmt(g, b)} (${word}). What equity do you need to call?`,
      data: { pot: p, bet: b },
      unit: '%',
      answer: { kind: 'number', value: Math.round(need * 10) / 10, tolerance: 2 },
      explain: `You call ${fmt(g, b)} to win the pot plus both bets, ${fmt(g, p + 2 * b)}: ${fmt(g, b)} ÷ ${fmt(g, p + 2 * b)} = ${need.toFixed(1)} %. Rule of thumb: ½ pot needs 25 %, pot needs 33 %.`,
    };
  }
  if (kind === 'bet-size') {
    const p = pot();
    const [f, word] = pick(rand, FRACTIONS.filter(([x]) => x !== 1));
    const b = p * f;
    return {
      ...base,
      type: kind,
      prompt: `The pot is ${fmt(g, p)}. How much is a ${word} pot bet?`,
      data: { pot: p },
      unit: g.currency.code,
      money: g.currency,
      answer: { kind: 'number', value: Math.round(b), tolerance: Math.round(bb / 5), relative: 0.05 },
      explain: `${fmt(g, p)} × ${f} = ${fmt(g, Math.round(b))}.`,
    };
  }
  if (kind === 'raise') {
    const bet = round(g, between(rand, 2, 20) * bb);
    const x = pick(rand, [2.5, 3, 3.5, 4]);
    return {
      ...base,
      type: kind,
      prompt: `He bets ${fmt(g, bet)}. You raise ${x}x. Raise to how much?`,
      data: { bet },
      unit: g.currency.code,
      money: g.currency,
      answer: { kind: 'number', value: Math.round(bet * x), tolerance: Math.round(bb / 5) },
      explain: `${x} × ${fmt(g, bet)} = ${fmt(g, Math.round(bet * x))} in total (a raise is "to", counting his bet).`,
    };
  }
  if (kind === 'pot-raise') {
    const p = pot();
    const bet = round(g, p * pick(rand, [0.33, 0.5, 0.75, 1]));
    const to = p + 3 * bet;
    return {
      ...base,
      type: kind,
      prompt: `The pot was ${fmt(g, p)}, he bets ${fmt(g, bet)}. You raise pot. Raise to how much?`,
      data: { pot: p, bet },
      unit: g.currency.code,
      money: g.currency,
      answer: { kind: 'number', value: to, tolerance: Math.round(bb / 5) },
      explain: `Call first (${fmt(g, bet)}), then raise the whole pot after the call: ${fmt(g, p)} + ${fmt(g, bet)} + ${fmt(g, bet)} = ${fmt(g, p + 2 * bet)}. Raise to ${fmt(g, bet)} + ${fmt(g, p + 2 * bet)} = ${fmt(g, to)} - the quick way: pot + 3 × bet.`,
    };
  }
  if (kind === 'spr') {
    const p = pot();
    const stack = round(g, between(rand, 20, 200) * bb);
    const spr = stack / p;
    return {
      ...base,
      type: kind,
      prompt: `On the flop the pot is ${fmt(g, p)} and the smaller stack has ${fmt(g, stack)} behind. What is the SPR?`,
      data: { pot: p, stack },
      answer: { kind: 'number', value: Math.round(spr * 10) / 10, tolerance: Math.max(0.3, spr * 0.05) },
      explain: `SPR = stack ÷ pot = ${fmt(g, stack)} ÷ ${fmt(g, p)} = ${spr.toFixed(1)}. Under about 3, top pair is happy to get it all in; over 10, it isn't.`,
    };
  }
  if (kind === 'side-pot') {
    // three players all-in for different amounts (and one bigger stack that covers them)
    const stacks = [between(rand, 10, 40), between(rand, 41, 80), between(rand, 81, 160)].map((x) => round(g, x * bb));
    const [a, b2, c] = stacks as [number, number, number];
    const which = pick(rand, ['main', 'side']);
    const main = a * 3;
    const side = (b2 - a) * 2;
    const value = which === 'main' ? main : side;
    return {
      ...base,
      type: kind,
      prompt: `Preflop, three players are all-in: ${fmt(g, a)}, ${fmt(g, b2)} and ${fmt(g, c)} (the biggest covers). How big is the ${which === 'main' ? 'main pot' : 'first side pot'}? (Leave the blinds out.)`,
      data: { stacks },
      unit: g.currency.code,
      money: g.currency,
      answer: { kind: 'number', value, tolerance: 0 },
      explain: `Main pot: the shortest stack from each, 3 × ${fmt(g, a)} = ${fmt(g, main)}. Side pot: what the two others put in beyond that, up to the middle stack: 2 × (${fmt(g, b2)} − ${fmt(g, a)}) = ${fmt(g, side)}. The rest of the big stack (${fmt(g, c - b2)}) goes back.`,
    };
  }
  // geometric
  const p = pot();
  const stack = round(g, between(rand, 2, 8) * p);
  const streets = pick(rand, [2, 3]);
  const bet = geometricBet(p, stack, streets);
  return {
    ...base,
    type: 'geometric',
    prompt: `${streets === 3 ? 'Flop' : 'Turn'}: pot ${fmt(g, p)}, effective stack ${fmt(g, stack)}. You want to be all-in by the river with bets of the same share of the pot each street, called each time. How much do you bet now?`,
    data: { pot: p, stack, streets },
    unit: g.currency.code,
    money: g.currency,
    answer: { kind: 'number', value: Math.round(bet), relative: 0.07 },
    explain: `The pot must grow by f = ((pot + 2 × stack) ÷ pot)^(1/${streets}) = ${Math.pow((p + 2 * stack) / p, 1 / streets).toFixed(2)} a street; the bet is pot × (f − 1) ÷ 2 = ${fmt(g, Math.round(bet))}, ${Math.round((100 * bet) / p)} % pot.`,
  };
}
