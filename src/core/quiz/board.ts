/**
 * Ranges on the board:
 *   1 Bucket the hand    - your hand on this flop: can play for stacks, thick or thin value, showdown
 *                          value, a strong or weak draw, air (HHP's big buckets, buckets.ts)
 *   2 Ahead of his range - your hand against his opening range on the flop: ahead, close or behind?
 *   3 Count his combos   - how many of his opening hands can play for stacks on this flop?
 *   4 Who has the nuts   - the raiser's range or the caller's: who holds more of the strongest hands?
 *   5 Blockers           - river, he has a range: which of your bluffs takes away most of his value?
 *
 * His ranges are the library's live 100 BB charts (what the bots play).
 */

import { cardsFromComboIndex, cardToString, prettyCard, type Card } from '../cards';
import { BUCKET_LABELS, BUCKETS, bucketAll, bucketOf, type Bucket } from '../buckets';
import { equityVsRange } from '../equity/equity';
import { classifyAll, classifyHand, MADE_LABELS, type HandClass } from '../handClass';
import type { LibraryRange } from '../ranges/library';
import { chartWeights, withoutCards, type Weights } from '../ranges/range';
import { charts } from './ranges';
import { newId, pick, shuffled, type Question, type Rand } from './types';

const s = (cards: readonly Card[]) => cards.map(cardToString);
const pretty = (cards: readonly Card[]) => cards.map(prettyCard).join('');
const deal = (rand: Rand, n: number, dead: readonly Card[] = []) =>
  shuffled(
    rand,
    Array.from({ length: 52 }, (_, c) => c).filter((c) => !dead.includes(c)),
  ).slice(0, n);

/** The opening chart for a seat (EP = UTG, MP = lojack). */
function rfiChart(seat: string): LibraryRange {
  const want = seat === 'EP' ? 'UTG' : seat === 'MP' ? 'LJ' : seat;
  const r = charts('RFI').find((x) => x.positions.includes(want));
  if (!r) throw new Error(`No opening chart for ${seat}`);
  return r;
}
const SEATS = ['EP', 'MP', 'HJ', 'CO', 'BTN'] as const;
const seatName = (seat: string) => (seat === 'EP' ? 'early position' : seat === 'MP' ? 'middle position' : `the ${seat}`);

/** Opening range of a seat, as combo weights. */
const openRange = (seat: string): Weights => chartWeights(rfiChart(seat).chart, ['raise', 'allin']);

function describe(h: HandClass): string {
  const draw = h.flushDraw ? ' with a flush draw' : h.straightDraw === 'open' ? ' with an open-ender' : h.straightDraw === 'gutshot' ? ' with a gutshot' : '';
  return `${MADE_LABELS[h.made]}${draw}`;
}

const BUCKET_WHY: Record<Bucket, string> = {
  cpfs: 'Sets, two pair, straights, strong flushes: happy to get the stacks in.',
  thick: 'Overpairs and top pair with a good kicker: bet for value, rarely folds to one bet.',
  thin: 'Weaker top pairs and second pairs: value against worse, but one bet at a time.',
  sdv: 'Low pairs and ace-high: wants to see a showdown cheaply, not to bet.',
  'strong-draw': 'Flush draws and open-enders (a weak pair with one goes here too): raise or call, they play as draws.',
  'weak-draw': 'A gutshot and nothing else: a cheap call or a bluff, rarely more.',
  air: 'Nothing and no real draw: give up or bluff.',
};

function bucketQuestion(level: number, rand: Rand): Question {
  const board = deal(rand, 3);
  const all = bucketAll(board);
  const want = pick(rand, BUCKETS);
  const combos = all.flatMap((b, combo) => (b === want ? [combo] : []));
  const combo = combos.length ? pick(rand, combos) : all.findIndex((b) => b !== null);
  const hero = cardsFromComboIndex(combo);
  const h = classifyHand(hero, board);
  const b = bucketOf(h);
  return {
    id: newId(rand),
    quiz: 'board',
    level,
    type: 'bucket',
    prompt: 'Which bucket is your hand in on this flop?',
    data: { hero: s(hero), board: s(board) },
    choices: BUCKETS.map((x) => ({ id: x, label: BUCKET_LABELS[x] })),
    answer: { kind: 'choice', id: b },
    explain: `${pretty(hero)} on ${pretty(board)}: ${describe(h)}. ${BUCKET_LABELS[b]}: ${BUCKET_WHY[b]}`,
  };
}

function aheadQuestion(level: number, rand: Rand): Question {
  for (let guard = 0; guard < 60; guard++) {
    const seat = pick(rand, SEATS);
    const board = deal(rand, 3);
    // your hand: one you'd have called with (a random hand from the big blind's defence is close enough)
    const defend = charts('vs RFI BTN').find((r) => r.positions.includes('BB')) ?? charts('vs RFI BTN')[0]!;
    const yours = chartWeights(defend.chart, ['call', 'raise', 'allin']);
    const live = [...yours.keys()].filter((c) => yours[c]! > 0 && !cardsFromComboIndex(c).some((x) => board.includes(x)));
    const hero = cardsFromComboIndex(pick(rand, live));
    const his = withoutCards(openRange(seat), [...hero, ...board]);
    const eq = equityVsRange(hero, board, his).equity;
    if (!Number.isFinite(eq)) continue;
    // clear cases only
    if (Math.abs(eq - 0.4) < 0.04 || Math.abs(eq - 0.6) < 0.04) continue;
    const id = eq >= 0.6 ? 'ahead' : eq >= 0.4 ? 'close' : 'behind';
    const h = classifyHand(hero, board);
    return {
      id: newId(rand),
      quiz: 'board',
      level,
      type: 'ahead',
      prompt: `He opened from ${seatName(seat)} and you called. On this flop, how does your hand do against his whole opening range?`,
      data: { hero: s(hero), board: s(board), seat },
      choices: [
        { id: 'ahead', label: 'Ahead (60 %+)' },
        { id: 'close', label: 'Close (40-60 %)' },
        { id: 'behind', label: 'Behind (under 40 %)' },
      ],
      answer: { kind: 'choice', id },
      explain: `${pretty(hero)} (${describe(h)}) has ${Math.round(eq * 100)} % against his ${seat} opening range on ${pretty(board)}. Think of what his range holds here: big pairs and big aces from early position, many more weak hands from the button.`,
    };
  }
  throw new Error('no ahead question found');
}

/** Weighted combos of a range in a bucket on a board, by made class. */
function strongCombos(range: Weights, board: readonly Card[], bucket: Bucket = 'cpfs') {
  const classes = classifyAll(board);
  const by = new Map<string, number>();
  let total = 0;
  let all = 0;
  classes.forEach((h, combo) => {
    const w = range[combo]!;
    if (!h || !(w > 0)) return;
    all += w;
    if (bucketOf(h) !== bucket) return;
    total += w;
    const k = MADE_LABELS[h.made];
    by.set(k, (by.get(k) ?? 0) + w);
  });
  const list = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${Math.round(n * 10) / 10}`);
  return { total, all, list };
}

function countQuestion(level: number, rand: Rand): Question {
  for (let guard = 0; guard < 60; guard++) {
    const seat = pick(rand, SEATS);
    const board = deal(rand, 3);
    const his = withoutCards(openRange(seat), board);
    const { total, all, list } = strongCombos(his, board);
    if (total < 3) continue;
    const n = Math.round(total);
    return {
      id: newId(rand),
      quiz: 'board',
      level,
      type: 'count',
      prompt: `He opened from ${seatName(seat)}. On this flop, how many combos of his range can play for stacks (sets, two pair, straights, strong flushes)?`,
      data: { board: s(board), seat },
      unit: 'combos',
      answer: { kind: 'number', value: n, tolerance: 2, relative: 0.3 },
      explain: `About ${n} of his ${Math.round(all)} combos (${Math.round((100 * total) / all)} %): ${list.join(', ')}. Quick count: 3 combos of a set per pocket pair he opens that hits the board; 9 combos of two pair per hand he opens suited and offsuit that hits two board cards (3 × 3), at most 3 if he opens it suited only.`,
    };
  }
  throw new Error('no count question found');
}

function nutsQuestion(level: number, rand: Rand): Question {
  for (let guard = 0; guard < 80; guard++) {
    const scenario = pick(rand, ['vs RFI BTN', 'vs RFI CO', 'vs RFI EP']);
    const seat = scenario.replace('vs RFI ', '');
    const callChart = charts(scenario).find((r) => r.positions.includes('BB'));
    if (!callChart) continue;
    const board = deal(rand, 3);
    const raiser = withoutCards(openRange(seat), board);
    const caller = withoutCards(chartWeights(callChart.chart, ['call']), board);
    const a = strongCombos(raiser, board);
    const b = strongCombos(caller, board);
    if (a.all < 1 || b.all < 1) continue;
    const ra = a.total / a.all;
    const rb = b.total / b.all;
    const ratio = ra / Math.max(rb, 1e-9);
    // clear cases only: one side has at least 1.4 times the share, or within 10 %
    let id: string;
    if (ratio >= 1.4) id = 'raiser';
    else if (ratio <= 1 / 1.4) id = 'caller';
    else if (ratio >= 0.9 && ratio <= 1.1) id = 'even';
    else continue;
    if (ra + rb < 0.03) continue;
    const pc = (x: number) => `${Math.round(x * 1000) / 10} %`;
    return {
      id: newId(rand),
      quiz: 'board',
      level,
      type: 'nuts',
      prompt: `${seat === 'EP' ? 'Early position' : seat} opens, the big blind calls. On this flop, whose range has more hands that can play for stacks (as a share of the range)?`,
      data: { board: s(board), seat },
      choices: [
        { id: 'raiser', label: `The raiser (${seat})` },
        { id: 'caller', label: 'The caller (BB)' },
        { id: 'even', label: 'About even' },
      ],
      answer: { kind: 'choice', id },
      explain: `Raiser: ${pc(ra)} of his range (${a.list.join(', ') || 'none'}). Big blind: ${pc(rb)} (${b.list.join(', ') || 'none'}). High cards and big pairs favour the raiser; low connected boards favour the caller, who has the small pairs and suited connectors. The side with more nuts can bet bigger.`,
    };
  }
  throw new Error('no nuts question found');
}

function blockersQuestion(level: number, rand: Rand): Question {
  for (let guard = 0; guard < 120; guard++) {
    const seat = pick(rand, SEATS);
    const board = deal(rand, 5);
    const his = withoutCards(openRange(seat), board);
    const classes = classifyAll(board);
    const value: number[] = [];
    classes.forEach((h, combo) => {
      if (h && his[combo]! > 0 && bucketOf(h) === 'cpfs') value.push(combo);
    });
    const valueTotal = value.reduce((t, c) => t + his[c]!, 0);
    if (valueTotal < 6) continue;
    // your candidate bluffs: no pair, live cards
    const air = classes.flatMap((h, combo) => (h && (h.made === 'air' || h.made === 'king-high' || h.made === 'ace-high') ? [combo] : []));
    if (air.length < 3) continue;
    const picks = shuffled(rand, air).slice(0, 30);
    const blocked = (combo: number) => {
      const [a, b] = cardsFromComboIndex(combo);
      return value.reduce((t, v) => {
        const [x, y] = cardsFromComboIndex(v);
        return t + (x === a || x === b || y === a || y === b ? his[v]! : 0);
      }, 0);
    };
    const scored = picks.map((c) => ({ c, n: blocked(c) })).sort((p, q) => q.n - p.n);
    const best = scored[0]!;
    const others = shuffled(
      rand,
      scored.filter((x) => x.n <= best.n - 2 && !cardsFromComboIndex(x.c).some((k) => cardsFromComboIndex(best.c).includes(k))),
    ).slice(0, 2);
    if (others.length < 2) continue;
    const options = shuffled(rand, [best, ...others]);
    const label = (c: number) => pretty(cardsFromComboIndex(c));
    return {
      id: newId(rand),
      quiz: 'board',
      level,
      type: 'blockers',
      prompt: `River. He opened from ${seatName(seat)}. You want to bluff: which hand blocks most of his strong hands (two pair or better)?`,
      data: { board: s(board), seat },
      choices: options.map((o) => ({ id: String(o.c), label: label(o.c) })),
      answer: { kind: 'choice', id: String(best.c) },
      explain: `His strong hands here: about ${Math.round(valueTotal)} combos. ${options.map((o) => `${label(o.c)} takes out ${Math.round(o.n * 10) / 10}`).join(', ')}. Holding a card of his value hands means fewer of them, so he folds more often.`,
    };
  }
  throw new Error('no blockers question found');
}

export function boardQuestion(level: number, rand: Rand): Question {
  if (level <= 1) return bucketQuestion(level, rand);
  if (level === 2) return aheadQuestion(level, rand);
  if (level === 3) return countQuestion(level, rand);
  if (level === 4) return nutsQuestion(level, rand);
  return blockersQuestion(level, rand);
}
