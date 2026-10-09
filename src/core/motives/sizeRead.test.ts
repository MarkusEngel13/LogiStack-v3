/**
 * The size read (Marius's pool, review item 26, 2026-10-10): "a small bet looks weak, so they raise
 * it for value; a big bet looks strong, so they just call and let you keep betting". On a scary flop
 * a small bet gets raised now (fear and greed: the stacks have to go in); on a dry flop they wait a
 * street, then raise the turn about 95 % of the time.
 *
 * Spot: hand "#4 Home game" (9.10.2026, 9-max €0.10/€0.25, 100 BB): Hero opens the small blind to
 * 3 BB, Seat 2 calls in the big blind; flop J♥9♥4♠, pot €1.50, Hero first. The size explorer as the
 * Lab's Decision panel builds it. Before the fix Seat 2 (no type: Unknown) raised its stack-off
 * hands ▲52 / 81 / 99 / 100 % against ⅓ / ½ / ¾ / pot, its thick value ▲49 / 55 / 82 / 49 %.
 */

import { describe, expect, test } from 'vitest';
import type { Bucket } from '../buckets';
import { parseCards } from '../cards';
import { replaySteps } from '../engine/replay';
import type { HandEvent, HandRecord } from '../hand/types';
import { LIBRARY } from '../ranges/library';
import { parseRange } from '../ranges/notation';
import type { ChartChoice } from '../ranges/spot';
import { believedBarrel } from './beliefs';
import { decide, type Decision } from './decide';
import { MOTIVE_PRESETS, profileFor } from './profile';
import { exploreSizes, type SizeQuestion } from './sizes';
import { rangesAt, runStory, situationOf, storyInput } from './story';

const CHARTS: ChartChoice[] = LIBRARY.map((r) => ({ ...r }));
const SIZES = ['Bet ⅓ pot', 'Bet ½ pot', 'Bet ¾ pot', 'Bet pot'];

/** Hand #4 on any flop: the big blind (seat 2) without a type, or with one. */
function hand4(flop: string, bbType?: string, post: HandEvent[] = []): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: 'hand-4',
    createdAt: '2026-10-09T22:07:00Z',
    table: { seats: 9, venue: 'home', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
    button: 0,
    hero: 1,
    players: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((seat) => ({
      seat,
      name: seat === 1 ? 'Hero' : `Seat ${seat}`,
      stack: 2500,
      ...(seat === 1 ? { cards: ['8s', '6s'] as [string, string] } : {}),
      ...(seat === 2 && bbType ? { playerType: bbType } : {}),
    })),
    events: [
      ...[3, 4, 5, 6, 7, 8, 0].map((seat) => ({ type: 'action' as const, seat, action: 'fold' as const })),
      { type: 'action', seat: 1, action: 'raise', to: 75 },
      { type: 'action', seat: 2, action: 'call' },
      { type: 'board', cards: flop.split(' ') },
      ...post,
    ],
  };
}

/** The story so far, and the state at the end of the hand. */
function atEnd(hand: HandRecord) {
  const steps = replaySteps(hand);
  const input = storyInput(hand, steps, CHARTS)!;
  const story = runStory(input);
  const at = steps.length - 1;
  return { input, story, at, state: steps[at]! };
}

/** Hero to act: the size explorer's question, as the Decision panel builds it. */
function question(hand: HandRecord): SizeQuestion {
  const { input, story, at, state } = atEnd(hand);
  const me = state.seats.find((s) => s.seat === 1)!;
  const bb = state.seats.find((s) => s.seat === 2)!;
  const narrowed = rangesAt(input, story, at);
  return {
    situation: situationOf(state, 1).situation,
    actor: { profile: profileFor(me), range: narrowed.get(1)!, cards: me.cards ?? undefined, streetBet: me.streetBet },
    others: [
      {
        seat: 2,
        profile: profileFor(bb),
        range: narrowed.get(2)!,
        seen: rangesAt(input, story, at, { observer: 1 }).get(2),
        seesActor: rangesAt(input, story, at, { observer: 2 }).get(1),
        streetBet: bb.streetBet,
        stack: bb.stack,
        inPosition: true,
        after: true,
      },
    ],
  };
}

/** Seat 2's raise share per bucket against ⅓, ½, ¾ and pot. */
function raisesBySize(flop: string, bbType?: string): Record<'cpfs' | 'thick', number[]> {
  const rows = exploreSizes(question(hand4(flop, bbType))).rows;
  const at = (label: string) => rows.find((r) => r.label === label)!.players[0]!.byBucket;
  return {
    cpfs: SIZES.map((l) => at(l).cpfs!.raise),
    thick: SIZES.map((l) => at(l).thick!.raise),
  };
}

/** Each share at most the one before it (a hair of noise allowed). */
const neverRises = (xs: number[]) => xs.every((x, i) => i === 0 || x <= xs[i - 1]! + 0.02);

const raiseShare = (d: Decision, b: Bucket) => {
  const row = d.byBucket[b]!;
  return d.options.reduce((x, o, i) => x + (o.kind === 'raise' ? row.shares[i]! : 0), 0);
};

describe('the size read: small bets get raised, big bets get called', { timeout: 300_000 }, () => {
  test('the pool reads a small bet as weak and a big one as strong', () => {
    expect(believedBarrel(1 / 3)).toBeLessThan(believedBarrel(0.5));
    expect(believedBarrel(0.5)).toBeLessThan(believedBarrel(1));
    expect(believedBarrel(10)).toBeLessThanOrEqual(0.9);
  });

  // Marius's rule: the raise share of stack-off hands (and thick value) falls as the bet grows.
  for (const type of [undefined, 'Fish']) {
    test(`hand #4 on J♥9♥4♠, ${type ?? 'Unknown'} in the big blind: the bigger the bet, the less it gets raised`, () => {
      const r = raisesBySize('Jh 9h 4s', type);
      for (const b of ['cpfs', 'thick'] as const) {
        expect(neverRises(r[b]), `${b} ${r[b].map((x) => x.toFixed(2))}`).toBe(true);
        expect(r[b][3]!, b).toBeLessThan(r[b][0]! - 0.3);
      }
      // a scary flop and a small bet: most monsters raise now (fear of the draws, greed for the stacks)
      expect(r.cpfs[0]!).toBeGreaterThan(0.6);
      // a pot-sized bet reads strong: they flat and let him keep betting
      expect(r.cpfs[3]!).toBeLessThan(0.2);
    });
  }

  // The same rule on a dry board, where they wait a street whatever the size.
  for (const type of [undefined, 'Fish']) {
    test(`hand #4 on K♠7♦2♣, ${type ?? 'Unknown'}: monsters flat the dry flop at every size`, () => {
      const r = raisesBySize('Ks 7d 2c', type);
      expect(neverRises(r.cpfs), `${r.cpfs.map((x) => x.toFixed(2))}`).toBe(true);
      for (const x of r.cpfs) expect(x).toBeLessThan(0.2);
    });
  }

  // "They wait a street, but they raise the turn about 95 % of the time": hand #4 on K♠7♦2♣, Hero
  // bets ½ pot, Seat 2 calls; turn 3♥, Hero bets again.
  test('after flatting the dry flop, monsters raise a normal turn bet', () => {
    for (const type of [undefined, 'Fish']) {
      for (const turnBet of [100, 150]) {
        const post: HandEvent[] = [
          { type: 'action', seat: 1, action: 'bet', to: 75 },
          { type: 'action', seat: 2, action: 'call' },
          { type: 'board', cards: ['3h'] },
          { type: 'action', seat: 1, action: 'bet', to: turnBet },
        ];
        const { input, story, at, state } = atEnd(hand4('Ks 7d 2c', type, post));
        const d = decide(
          profileFor(state.seats.find((s) => s.seat === 2)!),
          situationOf(state, 2).situation,
          rangesAt(input, story, at).get(2)!,
          rangesAt(input, story, at, { observer: 2 }).get(1)!,
        );
        expect(raiseShare(d, 'cpfs'), `${type ?? 'Unknown'} vs ${turnBet}`).toBeGreaterThan(0.85);
      }
    }
  });

  // Out of position as well (the big blind, a Fish, facing the button's c-bet), on a wet and a
  // static board: sets still fast-play the wet one and slow-play the static one (motives.test.ts).
  test('out of position too: the raise share of stack-off hands never grows with the bet', () => {
    const btn = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
    const bb = parseRange('22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o');
    for (const board of ['Js 9d 2s', 'Ac 7d 2h']) {
      const shares = [1 / 3, 0.5, 0.75, 1].map((f) => {
        const toCall = Math.round(550 * f);
        const s = { board: parseCards(board.split(' ')), pot: 550, toCall, stack: 9700, oppStack: 9700 - toCall, bb: 100, inPosition: false };
        return raiseShare(decide(MOTIVE_PRESETS.Fish!, s, bb, btn), 'cpfs');
      });
      expect(neverRises(shares), `${board} ${shares.map((x) => x.toFixed(2))}`).toBe(true);
    }
  });
});
