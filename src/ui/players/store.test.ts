import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.hoisted(() => {
  // sync.ts (the store takes a key name from it) reads Storage.prototype when it loads
  const g = globalThis as { Storage?: unknown };
  g.Storage ??= class {
    setItem() {}
  };
});

import marius from '../../core/fixtures/players-2026-10-10.json';
import { typeSettings } from '../../core/players/style';
import { loadPlayers, overridesFrom, playerSettings, reviewPlayer, savePlayer, type SavedPlayer } from './store';

class Mem {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const v1 = marius.players as Record<string, Record<string, string>>;

/** Three of Marius's players as the app saved them before the question versions (on/off switches, exact open sizes). */
const SAVED = [
  {
    id: 'j',
    name: 'Jansen',
    profileId: 'type:LAG',
    overrides: { sliders: { loose: 3, pfAggr: 3, cbet: 5, sticky: 4, respect: 3, bluffs: 3.5 }, sizing: 'half', openBB: 4 },
    answers: v1.Jansen,
  },
  {
    id: 'm',
    name: 'Michel',
    profileId: 'type:TAG',
    overrides: { sliders: { loose: 4, pfAggr: 4.5, postAggr: 4, cbet: 4, sticky: 4, respect: 3 }, sizing: 'payoff', leads: true, openBB: 5 },
    answers: v1.Michel,
  },
  {
    id: 'o',
    name: 'Olivier',
    profileId: 'type:Unknown',
    overrides: { sliders: { pfAggr: 2, postAggr: 3, cbet: 2, respect: 4.5, bluffs: 2 }, sizing: 'half', limpTrap: true, leads: true, openBB: 3 },
    answers: v1.Olivier,
  },
  { id: 'd', name: 'Dan', profileId: 'type:Fish', overrides: { leads: true } },
];

const byName = (name: string) => loadPlayers().find((p) => p.name === name)!;

beforeEach(() => {
  vi.stubGlobal('localStorage', new Mem());
  localStorage.setItem('logistack.players.v1', JSON.stringify(SAVED));
});

describe('saved players and the question versions', () => {
  test('players saved before the versions play as before: on/off switches read as levels', () => {
    const dan = byName('Dan');
    expect(dan.answersVersion).toBeUndefined(); // no answers, nothing to move
    expect(playerSettings(dan).leads).toBe(2);
    const olivier = playerSettings(byName('Olivier'));
    expect(olivier.limpTrap).toBe(1);
    expect(olivier.leads).toBe(2);
  });

  test('clean moves happen as they are read; ambiguous answers wait for the review, his settings untouched', () => {
    const jansen = byName('Jansen');
    expect(jansen.answersVersion).toBe(2);
    expect(jansen.review).toBeUndefined();
    expect(jansen.answers?.open).toBe('3-4');
    expect(playerSettings(jansen).openBB).toBe(3.5);
    expect(playerSettings(jansen).sliders).toEqual(playerSettings(SAVED[0] as SavedPlayer).sliders);

    const michel = byName('Michel');
    expect(michel.review?.map((a) => a.q).sort()).toEqual(['leads', 'open']);
    expect(michel.answers?.open).toBeUndefined();
    expect(playerSettings(michel)).toEqual(playerSettings(SAVED[1] as SavedPlayer));
    // reading moves nothing in storage: the move is saved with the next change
    expect(JSON.parse(localStorage.getItem('logistack.players.v1')!)[1].answersVersion).toBeUndefined();
  });

  test('the review: one answer each, his sliders follow, the move is saved once', () => {
    let michel = byName('Michel');
    const [open, leads] = ['open', 'leads'].map((q) => michel.review!.find((a) => a.q === q)!);
    michel = reviewPlayer(michel, open!, '7+');
    michel = reviewPlayer(michel, leads!, 'rarely');
    expect(michel.review).toEqual([]);
    expect(michel.answers).toMatchObject({ open: '7+', leads: 'rarely' });
    expect(playerSettings(michel)).toMatchObject({ openBB: 8, leads: 1 });
    savePlayer(michel);
    const again = byName('Michel');
    expect(again.answersVersion).toBe(2);
    expect(playerSettings(again)).toMatchObject({ openBB: 8, leads: 1 });
    // everyone was saved on the new questions with it; nothing moves twice
    const stored = JSON.parse(localStorage.getItem('logistack.players.v1')!) as SavedPlayer[];
    expect(stored.find((p) => p.name === 'Jansen')!.answersVersion).toBe(2);
    expect(playerSettings(byName('Jansen')).openBB).toBe(3.5);
  });

  test('players saved before the pair jam never do it; a level set on him is kept as an override', () => {
    const dan = byName('Dan');
    expect(playerSettings(dan).pairJam).toBe(0);
    expect(playerSettings({ ...dan, overrides: { ...dan.overrides, pairJam: 2 } }).pairJam).toBe(2);
    expect(overridesFrom({ ...playerSettings(dan), pairJam: 1 }, typeSettings('Fish')).pairJam).toBe(1);
    expect(overridesFrom(playerSettings(dan), typeSettings('Fish')).pairJam).toBeUndefined();
  });

  test("don't know drops the answer and keeps his sliders", () => {
    const olivier = byName('Olivier');
    const cbet = olivier.review!.find((a) => a.q === 'cbet')!;
    const after = reviewPlayer(olivier, cbet, null);
    expect(after.answers?.cbet).toBeUndefined();
    expect(playerSettings(after).sliders.cbet).toBe(2);
    const mixed = reviewPlayer(olivier, cbet, 'mixed');
    expect(playerSettings(mixed).sliders.cbet).toBe(3);
  });
});
