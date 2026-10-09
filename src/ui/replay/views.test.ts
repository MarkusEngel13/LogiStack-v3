import { describe, expect, test } from 'vitest';
import { FIXTURES } from '../../core/fixtures';
import { nextHand } from '../../core/hand/nextHand';
import { CURRENCIES } from '../format';
import { actionRows, beforeHand, moneyFor, replaySeatViews, resultSummary, safeSteps, streetSteps } from './views';

const money = moneyFor(FIXTURES.multiwayShowdown, 'currency');

describe('replay views', () => {
  test('safeSteps stops at a broken event and reports it', () => {
    const broken = { ...FIXTURES.steal, events: [...FIXTURES.steal.events.slice(0, 2), { type: 'action' as const, seat: 0, action: 'fold' as const }] };
    const { steps, error } = safeSteps(broken);
    expect(steps).toHaveLength(3);
    expect(error?.eventIndex).toBe(2);
  });

  test('action list reads like a hand history, with street headers and the result', () => {
    const rec = FIXTURES.multiwayShowdown;
    const { steps } = safeSteps(rec);
    const rows = actionRows(rec, steps.at(-1)!, money);
    expect(rows[0]).toMatchObject({ text: 'Hanna posts small blind €1', street: 'preflop', step: 0 });
    expect(rows.find((r) => r.text === 'Carl raises to €6')).toMatchObject({ tone: 'bet', step: 1 });
    expect(rows.find((r) => r.street === 'flop')).toMatchObject({ text: 'Flop', cards: [expect.any(Number), expect.any(Number), expect.any(Number)] });
    expect(rows.find((r) => r.text.startsWith('Hero bets'))).toMatchObject({ text: 'Hero bets €114 and is all-in', tone: 'allin' });
    expect(rows.filter((r) => r.street === 'result')).toHaveLength(1);
    expect(rows.map((r) => r.text)).toContain('Hero wins €612 with Flush, King high');
    expect(rows.map((r) => r.text)).toContain('Rake €5');
  });

  test('side pots and side games in the result rows', () => {
    const sp = FIXTURES.sidePots;
    const spRows = actionRows(sp, safeSteps(sp).steps.at(-1)!, moneyFor(sp, 'currency')).map((r) => r.text);
    expect(spRows).toContain('Ana wins €120 from the main pot with Pair of Aces');
    expect(spRows).toContain('Hero wins €80 from side pot 2 with Pair of Queens');

    const s72 = FIXTURES.straddle72;
    const rows72 = actionRows(s72, safeSteps(s72).steps.at(-1)!, moneyFor(s72, 'currency')).map((r) => r.text);
    expect(rows72).toContain('Cal posts straddle €4');
    expect(rows72).toContain('Uncalled €20 returned to Fritz');
    expect(rows72).toContain('7-2 bounty: Hero pays Fritz €5');
  });

  test('seat views: Hero always sees their cards; others only with "show all" or at showdown', () => {
    const rec = FIXTURES.multiwayShowdown;
    const { steps } = safeSteps(rec);
    const preflop = steps[1]!;
    const hidden = replaySeatViews(rec, preflop, { money, showAllCards: false, isLastStep: false });
    expect(hidden.find((v) => v.seat === 0)!.cards).toEqual([expect.any(Number), expect.any(Number)]); // Hero
    expect(hidden.find((v) => v.seat === 4)!.cards).toEqual([null, null]); // Dora, face down
    const shown = replaySeatViews(rec, preflop, { money, showAllCards: true, isLastStep: false });
    expect(shown.find((v) => v.seat === 4)!.cards).not.toEqual([null, null]);
    const end = replaySeatViews(rec, steps.at(-1)!, { money, showAllCards: false, isLastStep: true });
    expect(end.find((v) => v.seat === 4)!.cards).not.toEqual([null, null]); // showdown
    expect(end.find((v) => v.seat === 0)).toMatchObject({ winner: true, action: { text: 'Wins €612', tone: 'win' } });
    expect(end.find((v) => v.seat === 2)).toMatchObject({ folded: true, cards: undefined });
  });

  test('action tags, blind raises and amounts in big blinds', () => {
    const rec = { ...FIXTURES.steal, events: [{ type: 'action' as const, seat: 0, action: 'raise' as const, to: 600, blind: true }] };
    const { steps } = safeSteps(rec);
    const views = replaySeatViews(rec, steps[1]!, { money: moneyFor(rec, 'bb'), showAllCards: true, isLastStep: true });
    expect(views.find((v) => v.seat === 0)).toMatchObject({ action: { text: 'Blind raise', tone: 'bet' }, betText: '3 BB' });
    expect(actionRows(rec, steps[1]!, moneyFor(rec, 'bb')).at(-1)!.text).toBe('Anna raises blind to 3 BB');
  });

  test('at the end, stacks are final (bounties included) and the summary names the side games', () => {
    const rec = FIXTURES.straddle72;
    const { steps } = safeSteps(rec);
    const money72 = moneyFor(rec, 'currency');
    const end = replaySeatViews(rec, steps.at(-1)!, { money: money72, showAllCards: true, isLastStep: true });
    expect(end.find((v) => v.seat === 5)!.stackText).toBe('€238'); // 200 - 10 + 33 + 15
    expect(end.find((v) => v.seat === 0)!.stackText).toBe('€194'); // posted 1, paid 5
    expect(resultSummary(rec, steps.at(-1)!.result, money72)).toEqual(['7-2: Fritz collects €15']);
    const sq = FIXTURES.squid;
    expect(resultSummary(sq, safeSteps(sq).steps.at(-1)!.result, moneyFor(sq, 'currency'))).toEqual([
      'Hero gets a squid',
      'Rui pays €40 for squids',
    ]);
  });

  test('street jump targets', () => {
    const { steps } = safeSteps(FIXTURES.multiwayShowdown);
    expect(streetSteps(steps)).toEqual({ preflop: 0, flop: 7, turn: 13, river: 18, result: 20 });
  });

  test('a hand dropped unfinished: the next one starts from the stacks before it (blinds back), the button moves', () => {
    const rec = FIXTURES.multiwayShowdown;
    const { steps } = safeSteps(rec);
    const next = nextHand(rec, beforeHand(rec, steps[0]!), { id: 'n', createdAt: '', rand: () => 0.5 });
    expect(next.players.map((p) => p.stack)).toEqual(rec.players.map((p) => p.stack));
    expect(next.button).not.toBe(rec.button);
    expect(next.events).toEqual([]);
  });

  test('chips currency formats without symbol', () => {
    const chipsRec = { ...FIXTURES.steal, table: { ...FIXTURES.steal.table, currency: CURRENCIES.find((c) => c.code === 'CHIPS')! } };
    expect(moneyFor(chipsRec, 'currency')(500)).toBe('500');
  });
});
