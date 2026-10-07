import { describe, expect, test } from 'vitest';
import { applyEvent, replaySteps } from '../engine/replay';
import type { HandEvent, HandRecord } from '../hand/types';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import { botChoice } from './bot';
import { storyInput } from './story';

const CHARTS: ChartChoice[] = LIBRARY.map((r) => ({ ...r }));

/** The button (A♥J♥) opens, the big blind (a Fish with `bbCards`) calls; then `post`. */
function hand(flop: string, bbCards: [string, string], post: HandEvent[]): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: 'bot-test',
    createdAt: '2026-10-07T10:00:00Z',
    table: { seats: 6, venue: 'casino', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 50, bb: 100 } },
    button: 3,
    hero: 3,
    players: [0, 1, 2, 3, 4, 5].map((seat) => ({
      seat,
      name: seat === 3 ? 'Hero' : `P${seat}`,
      stack: 10000,
      ...(seat === 3 ? { cards: ['Ah', 'Jh'] as [string, string] } : seat === 5 ? { playerType: 'Fish', cards: bbCards } : {}),
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

const checkThenBet = (to: number): HandEvent[] => [
  { type: 'action', seat: 5, action: 'check' },
  { type: 'action', seat: 3, action: 'bet', to },
];

/** The bot's choice at the end of the hand so far. */
function choose(h: HandRecord, rand = () => 0.5) {
  const steps = replaySteps(h);
  const step = steps.length - 1;
  return { choice: botChoice(storyInput(h, steps, CHARTS)!, steps[step]!, step, rand), state: steps[step]!, step };
}

const share = (c: ReturnType<typeof choose>['choice'], kind: string) =>
  c.options.filter((o) => o.event.type === 'action' && (o.event.action === kind || (kind === 'raise' && o.event.action === 'allin'))).reduce((s, o) => s + o.p, 0);

describe('bots after the flop', { timeout: 120_000 }, () => {
  // HHP: sets fast-play on wet boards for fear of the draws, and trap on static ones.
  test('a Fish with a set raises the c-bet on J♠9♦2♠ and calls it on A♣7♦2♥', () => {
    const wet = choose(hand('Js 9d 2s', ['9s', '9c'], checkThenBet(183))).choice;
    expect(share(wet, 'raise')).toBeGreaterThan(0.8);
    const dry = choose(hand('Ac 7d 2h', ['7s', '7h'], checkThenBet(183))).choice;
    expect(share(dry, 'call')).toBeGreaterThan(share(dry, 'raise'));
  });

  test('a Fish with nothing folds to a pot-sized bet', () => {
    const { choice } = choose(hand('Js 9d 2s', ['5c', '3d'], checkThenBet(550)));
    expect(share(choice, 'fold')).toBeGreaterThan(0.5);
  });

  test('every option is a legal action, and the draw follows the chances', () => {
    const { choice, state, step } = choose(hand('Js 9d 2s', ['9s', '9c'], checkThenBet(183)));
    expect(choice.options.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1, 6);
    for (const o of choice.options) expect(() => applyEvent(state, o.event, step)).not.toThrow();
    const first = choice.options.findIndex((o) => o.p > 0);
    const h = hand('Js 9d 2s', ['9s', '9c'], checkThenBet(183));
    expect(choose(h, () => 0).choice.picked).toBe(first);
    expect(choose(h, () => 0.999999).choice.event).toEqual([...choice.options].reverse().find((o) => o.p > 0)!.event);
  });

  test('first to act it checks or bets; it needs real cards and a flop', () => {
    const lead = choose(hand('Ac 7d 2h', ['7s', '7h'], [])).choice;
    expect(lead.seat).toBe(5);
    expect(share(lead, 'check') + share(lead, 'bet') + share(lead, 'raise')).toBeCloseTo(1, 6);
    const noCards = hand('Ac 7d 2h', ['7s', '7h'], []);
    noCards.players = noCards.players.map((p) => (p.seat === 5 ? { ...p, cards: undefined } : p));
    expect(() => choose(noCards)).toThrow(/unknown/);
    const preflop = hand('Ac 7d 2h', ['7s', '7h'], []);
    preflop.events = preflop.events.slice(0, 5);
    const steps = replaySteps(preflop);
    expect(() => botChoice(storyInput(preflop, steps, CHARTS) ?? { start: [], resets: [], profiles: [], points: [] }, steps[5]!, 5)).toThrow(/after the flop/);
  });
});
