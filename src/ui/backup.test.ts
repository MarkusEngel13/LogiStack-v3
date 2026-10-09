import { beforeEach, expect, test, vi } from 'vitest';
import { makeBackup, restoreBackup } from './backup';

class Mem {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
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

beforeEach(() => vi.stubGlobal('localStorage', new Mem()));

test('a backup moves everything but sync bookkeeping, and merges lists by id', () => {
  localStorage.setItem('logistack.hands.v0', JSON.stringify([{ id: 'a', n: 1 }, { id: 'b', n: 1 }]));
  localStorage.setItem('logistack.settings.v1', JSON.stringify({ theme: 'light' }));
  localStorage.setItem('logistack.sync.v1', '{}');
  localStorage.setItem('other.app', 'x');
  const b = makeBackup();
  expect(Object.keys(b.data).sort()).toEqual(['logistack.hands.v0', 'logistack.settings.v1']);

  vi.stubGlobal('localStorage', new Mem()); // the other address
  localStorage.setItem('logistack.hands.v0', JSON.stringify([{ id: 'b', n: 0 }, { id: 'c', n: 0 }]));
  expect(restoreBackup(JSON.parse(JSON.stringify(b)))).toBe(2);
  const hands = JSON.parse(localStorage.getItem('logistack.hands.v0')!) as { id: string; n: number }[];
  expect(hands.map((h) => `${h.id}${h.n}`).sort()).toEqual(['a1', 'b1', 'c0']);
  expect(JSON.parse(localStorage.getItem('logistack.settings.v1')!)).toEqual({ theme: 'light' });
  expect(() => restoreBackup({ nope: 1 })).toThrow();
});
