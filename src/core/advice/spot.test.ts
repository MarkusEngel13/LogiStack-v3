import { describe, expect, test } from 'vitest';
import { replaySteps } from '../engine/replay';
import type { HandEvent, HandRecord } from '../hand/types';
import { DIMENSIONS, spotTags, type SpotTags } from './spot';

/** 6-max, blinds 50/100, 100 BB deep: the button (seat 3) opens to 2.5 BB, the big blind (seat 5, a Fish) calls. */
function btnVsBb(post: HandEvent[], flop = 'Js 9d 2s', bbTags: string[] = []): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: 'spot-test',
    createdAt: '2026-10-08T00:00:00Z',
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

/** The tags for whoever is to act after all the events. */
function tagsAtEnd(hand: HandRecord): SpotTags {
  const steps = replaySteps(hand);
  const last = steps[steps.length - 1]!;
  expect(last.toAct).not.toBeNull();
  return spotTags(last, last.toAct!);
}

const act = (seat: number, action: 'check' | 'call' | 'fold'): HandEvent => ({ type: 'action', seat, action });
const bet = (seat: number, to: number): HandEvent => ({ type: 'action', seat, action: 'bet', to });
const raise = (seat: number, to: number): HandEvent => ({ type: 'action', seat, action: 'raise', to });

describe('spot tags: the words for a moment of a hand', () => {
  test('the button facing a flop check-raise from a Fish', () => {
    const t = tagsAtEnd(btnVsBb([act(5, 'check'), bet(3, 183), raise(5, 700)]));
    expect(t).toMatchObject({ street: ['flop'], pot: ['srp'], players: ['hu'], position: ['ip'], role: ['pfr'], decision: ['facing-raise'], villain: ['rec'], depth: ['100bb'] });
    expect(t.line).toContain('they-check-raise');
    expect(t.board).toEqual(expect.arrayContaining(['wet', 'flush-draw']));
  });

  test('the big blind facing a c-bet: out of position, a caller, a small bet', () => {
    const t = tagsAtEnd(btnVsBb([act(5, 'check'), bet(3, 183)]));
    expect(t).toMatchObject({ decision: ['facing-bet'], position: ['oop'], role: ['caller'], size: ['small'], villain: ['unknown'] });
    expect(t.line).toContain('they-cbet');
  });

  test('a turn donk into the preflop raiser, and the flush card as a scare card', () => {
    const t = tagsAtEnd(btnVsBb([act(5, 'check'), bet(3, 183), act(5, 'call'), { type: 'board', cards: ['5s'] }, bet(5, 700)]));
    expect(t.street).toEqual(['turn']);
    expect(t.line).toContain('they-donk');
    expect(t.board).toEqual(expect.arrayContaining(['scare-flush', 'flush-possible']));
    expect(t.size).toEqual(['big']);
  });

  test('a probe after the flop checked through, and the river after a checked turn', () => {
    const probe = tagsAtEnd(btnVsBb([act(5, 'check'), act(3, 'check'), { type: 'board', cards: ['4c'] }, bet(5, 300)]));
    expect(probe.line).toEqual(expect.arrayContaining(['flop-checked-through', 'they-probe']));
    const river = tagsAtEnd(
      btnVsBb([act(5, 'check'), bet(3, 183), act(5, 'call'), { type: 'board', cards: ['4c'] }, act(5, 'check'), act(3, 'check'), { type: 'board', cards: ['Kh'] }, act(5, 'check')]),
    );
    expect(river).toMatchObject({ street: ['river'], decision: ['first'] });
    expect(river.line).toEqual(expect.arrayContaining(['turn-checked-through', 'they-checked', 'i-cbet', 'i-checked-back']));
  });

  test('the double and triple barrel, and an overbet', () => {
    const turn = tagsAtEnd(btnVsBb([act(5, 'check'), bet(3, 183), act(5, 'call'), { type: 'board', cards: ['4c'] }, act(5, 'check'), bet(3, 750)]));
    expect(turn.line).toContain('they-double-barrel');
    expect(turn.size).toEqual(['big']);
    const river = tagsAtEnd(
      btnVsBb([
        act(5, 'check'), bet(3, 183), act(5, 'call'), { type: 'board', cards: ['4c'] }, act(5, 'check'), bet(3, 750), act(5, 'call'),
        { type: 'board', cards: ['Kh'] }, act(5, 'check'), bet(3, 3000),
      ]),
    );
    expect(river.line).toContain('they-triple-barrel');
    expect(river.size).toEqual(['overbet']);
  });

  test('preflop: the opener is first, the big blind faces the raise; statuses come through', () => {
    const hand = btnVsBb([], 'Js 9d 2s', ['stuck', 'drinking-tired']);
    const steps = replaySteps(hand);
    const atOpen = steps[3]!; // three folds: the button to act, unopened
    expect(spotTags(atOpen, 3)).toMatchObject({ street: ['preflop'], decision: ['first'], pot: ['limped'] });
    const atBb = steps[5]!; // the button raised, the small blind folded
    const t = spotTags(atBb, 5);
    expect(t).toMatchObject({ decision: ['facing-bet'], pot: ['srp'], role: ['caller'] });
    expect(t.line).toContain('they-raised');
    const btnSide = spotTags(steps[steps.length - 1]!, 3);
    expect(btnSide.status).toEqual(['stuck', 'drinking']);
  });

  test('every tag is in the vocabulary', () => {
    const t = tagsAtEnd(btnVsBb([act(5, 'check'), bet(3, 183), raise(5, 700)]));
    for (const [dim, values] of Object.entries(t)) {
      for (const v of values) expect(DIMENSIONS[dim as keyof typeof DIMENSIONS] as readonly string[]).toContain(v);
    }
  });
});
