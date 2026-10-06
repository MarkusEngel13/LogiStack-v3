import { describe, expect, test } from 'vitest';
import { bucketAll, type Bucket } from '../buckets';
import { parseCards } from '../cards';
import { replaySteps } from '../engine/replay';
import { FIXTURES } from '../fixtures';
import type { HandEvent, HandRecord } from '../hand/types';
import { LIBRARY } from '../ranges/library';
import { comboTotal } from '../ranges/range';
import type { ChartChoice } from '../ranges/spot';
import { rangesAt, runStory, storyInput, type StoryStep } from './story';
import { whyBucket } from './why';

const CHARTS: ChartChoice[] = LIBRARY.map((r) => ({ ...r }));

/** 6-max, 1/1 EUR... in cents: blinds 50/100, 100 BB deep. The button opens to 2.5 BB, the BB (a Fish) calls. */
function btnVsBb(flop: string, post: HandEvent[], bbTags: string[] = []): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: 'story-test',
    createdAt: '2026-10-06T20:00:00Z',
    table: { seats: 6, venue: 'casino', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 50, bb: 100 } },
    button: 3,
    hero: 3,
    players: [0, 1, 2, 3, 4, 5].map((seat) => ({
      seat,
      name: seat === 3 ? 'Hero' : `P${seat}`,
      stack: 10000,
      ...(seat === 5 ? { playerType: 'Fish', tags: bbTags } : {}),
    })),
    events: [
      { type: 'action', seat: 0, action: 'fold' },
      { type: 'action', seat: 1, action: 'fold' },
      { type: 'action', seat: 2, action: 'fold' },
      { type: 'action', seat: 3, action: 'raise', to: 250 },
      { type: 'action', seat: 4, action: 'fold' },
      { type: 'action', seat: 5, action: 'call' },
      { type: 'board', cards: flop.split(' ') },
      ...post,
    ],
  };
}

/** BB checks, the button c-bets a third of the pot (550), the BB calls. */
const checkBetCall: HandEvent[] = [
  { type: 'action', seat: 5, action: 'check' },
  { type: 'action', seat: 3, action: 'bet', to: 183 },
  { type: 'action', seat: 5, action: 'call' },
];

const share = (w: Float32Array, board: string, b: Bucket) => {
  const buckets = bucketAll(parseCards(board.split(' ')));
  let x = 0;
  let t = 0;
  for (let c = 0; c < 1326; c++) {
    if (!buckets[c] || !(w[c]! > 0)) continue;
    t += w[c]!;
    if (buckets[c] === b) x += w[c]!;
  }
  return x / t;
};

describe('the quantum villain: postflop actions narrow the ranges', { timeout: 120_000 }, () => {
  const WET = 'Js 9d 2s';
  const STATIC = 'Ac 7d 2h';
  const hand = btnVsBb(WET, checkBetCall);
  const steps = replaySteps(hand);
  const input = storyInput(hand, steps, CHARTS)!;
  const story = runStory(input);

  test('reads the hand: start ranges, profiles and each postflop action with its numbers', () => {
    expect(input.start.map((s) => s.seat).sort()).toEqual([3, 5]);
    expect(input.profiles.find((p) => p.seat === 5)!.profile.name).toBe('Fish');
    expect(input.profiles.find((p) => p.seat === 3)!.profile.name).toBe('Unknown');
    expect(input.points.map((p) => [p.event, p.seat, p.taken.kind])).toEqual([
      [7, 5, 'check'],
      [8, 3, 'bet'],
      [9, 5, 'call'],
    ]);
    const [check, bet, call] = input.points;
    expect(check!.situation).toMatchObject({ pot: 550, toCall: 0, stack: 9750, oppStack: 9750, inPosition: false });
    expect(bet!.situation).toMatchObject({ pot: 550, toCall: 0, inPosition: true });
    expect(bet!.situation.betSizes).toContain(183 / 550);
    expect(call!.situation).toMatchObject({ pot: 550, toCall: 183, stack: 9750, oppStack: 9567, inPosition: false });
  });

  test('every action keeps part of the range, and the taken option is the one that happened', () => {
    expect(story).toHaveLength(3);
    for (const s of story) {
      expect(s.skipped).toBeUndefined();
      expect(s.options[s.taken]!.kind).toBe(input.points.find((p) => p.event === s.event)!.taken.kind);
      expect(comboTotal(s.after)).toBeLessThan(comboTotal(s.before));
      expect(comboTotal(s.after)).toBeGreaterThan(0);
    }
    expect(story[1]!.options[story[1]!.taken]!.label).toBe('Bet ⅓ pot');
  });

  // HHP: a call of a small bet on a wet board caps the caller - the strong hands raise for fear of the draws.
  test('a call on the wet board caps the Fish; on the static board it does not', () => {
    const wetBefore = share(story[2]!.before, WET, 'cpfs');
    const wetAfter = share(story[2]!.after, WET, 'cpfs');
    const dryHand = btnVsBb(STATIC, checkBetCall);
    const dry = runStory(storyInput(dryHand, replaySteps(dryHand), CHARTS)!);
    const dryBefore = share(dry[2]!.before, STATIC, 'cpfs');
    const dryAfter = share(dry[2]!.after, STATIC, 'cpfs');
    expect(wetAfter / wetBefore).toBeLessThan(0.3);
    expect(dryAfter / dryBefore).toBeGreaterThan(0.7);
  });

  // HHP: strong hands fast-play wet boards out of fear (Strategy Bible, e.g. HHP-sQTa32Rfsqs);
  // on a static board they trap.
  test('why: the Fish raises its sets on the wet board for fear of the draws, traps them on the static one', () => {
    const wetWhy = whyBucket(story[2]!, 'cpfs')!;
    expect(wetWhy.tookIt).toBe(false); // the action taken was a call; sets mostly raised
    expect(story[2]!.options[wetWhy.winner]!.kind).toBe('raise');
    expect(wetWhy.reasons.slice(0, 2).map((r) => r.motive)).toContain('fear');
    expect(wetWhy.scaryCards).toBeGreaterThan(8);
    expect(story[2]!.nextCards).toBe(47);

    const dryHand = btnVsBb(STATIC, checkBetCall);
    const dry = runStory(storyInput(dryHand, replaySteps(dryHand), CHARTS)!);
    const dryWhy = whyBucket(dry[2]!, 'cpfs')!;
    expect(dryWhy.tookIt).toBe(true); // called: the trap
    expect(dryWhy.reasons.map((r) => r.motive)).toContain('trap');
    expect(dryWhy.scaryCards).toBeLessThan(wetWhy.scaryCards);
  });

  test('rangesAt: the start range before the flop action, the narrowed one after', () => {
    const atFlop = rangesAt(input, story, 7);
    expect(atFlop.get(5)).toBe(input.start.find((s) => s.seat === 5)!.weights);
    const atEnd = rangesAt(input, story, 10);
    expect(atEnd.get(5)).toBe(story[2]!.after);
    expect(atEnd.get(3)).toBe(story[1]!.after);
    // between the bet and the call: the button is narrowed, the BB only by its check
    const mid = rangesAt(input, story, 9);
    expect(mid.get(3)).toBe(story[1]!.after);
    expect(mid.get(5)).toBe(story[0]!.after);
  });

  test('a range set in the Lab after the flop replaces the narrowed one from that step on (god mode)', () => {
    const withNote: HandRecord = { ...hand, ranges: [{ seat: 5, fromEvent: 9, range: 'AA' }] };
    const inp = storyInput(withNote, replaySteps(withNote), CHARTS)!;
    const cache = new Map();
    const st = runStory(inp, cache);
    expect(comboTotal(st[2]!.before)).toBe(6);
    expect(rangesAt(inp, st, 9).get(5)).toBe(inp.resets[0]!.weights);
    expect(comboTotal(rangesAt(inp, st, 10).get(5)!)).toBeGreaterThan(0);
    // running again with the same cache makes no new decisions
    const size = cache.size;
    runStory(inp, cache);
    expect(cache.size).toBe(size);
  });

  test('multiway actions are left as they are (heads-up only for now)', () => {
    const s = replaySteps(FIXTURES.multiwayShowdown);
    const inp = storyInput(FIXTURES.multiwayShowdown, s, CHARTS)!;
    const st: StoryStep[] = runStory(inp);
    expect(st.length).toBeGreaterThan(0);
    const multi = st.filter((x) => x.skipped === 'multiway');
    expect(multi.length).toBeGreaterThan(0);
    for (const x of multi) expect(x.after).toBe(x.before);
  });
});
