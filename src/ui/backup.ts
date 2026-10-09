/**
 * Everything LogiStack keeps in this browser, as one file: hands, players, profiles, your charts,
 * settings, the wizard's last table, "smells fishy" marks. Browser storage belongs to one address,
 * so this is how data moves between `npm run dev` (localhost) and the website, or to a new device
 * before sync. The HHP / Carrel playbook (IndexedDB) is not included: it stays where you loaded it.
 */

const PREFIX = 'logistack.';
/** Sync's own bookkeeping: never carried over (the new place has its own). */
const SKIP = ['logistack.sync.v1', 'logistack.sharedProfiles.v1'];

export interface Backup {
  format: 'logistack.backup/1';
  at: string;
  data: Record<string, unknown>;
}

export function makeBackup(): Backup {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (!key.startsWith(PREFIX) || SKIP.includes(key)) continue;
    try {
      data[key] = JSON.parse(localStorage.getItem(key)!);
    } catch {
      data[key] = localStorage.getItem(key);
    }
  }
  return { format: 'logistack.backup/1', at: new Date().toISOString(), data };
}

/**
 * Restores a backup. Lists (hands, players, ...) are merged by id - what is here stays, what the
 * file adds comes in, the file wins where both have the same id; anything else is replaced.
 * Returns how many keys were restored.
 */
export function restoreBackup(file: unknown): number {
  const b = file as Backup;
  if (!b || b.format !== 'logistack.backup/1' || typeof b.data !== 'object') throw new Error('Not a LogiStack backup file.');
  let n = 0;
  for (const [key, value] of Object.entries(b.data)) {
    if (!key.startsWith(PREFIX) || SKIP.includes(key)) continue;
    let next = value;
    const isList = (x: unknown): x is { id: string }[] => Array.isArray(x) && x.every((y) => y && typeof (y as { id?: unknown }).id === 'string');
    if (isList(value)) {
      let here: unknown = [];
      try {
        here = JSON.parse(localStorage.getItem(key) ?? '[]');
      } catch {
        // unreadable here: the file's list replaces it
      }
      if (isList(here)) {
        const byId = new Map(here.map((x) => [x.id, x]));
        for (const x of value) byId.set(x.id, x);
        next = [...byId.values()];
      }
    }
    localStorage.setItem(key, typeof next === 'string' ? next : JSON.stringify(next));
    n++;
  }
  return n;
}
