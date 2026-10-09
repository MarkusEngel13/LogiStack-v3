/**
 * Merging one kind of item between this browser and the server, without losing work on either
 * side. The "shadow" remembers what the server had at the last sync (a hash per id), so each side
 * can tell what *it* changed since:
 * - changed here only -> send it up; changed there only -> take it; both -> this device wins
 *   (it is the one being used now);
 * - gone here but in the shadow -> deleted here: delete it there too; gone there (tombstone) and
 *   unchanged here -> delete it here.
 */

export interface Item {
  id: string;
}

export interface ServerItem<T> {
  id: string;
  data: T | null;
  deleted: boolean;
}

export type Shadow = Record<string, string>;

/** A short, stable fingerprint of an item (FNV-1a over its JSON). */
export function hashOf(x: unknown): string {
  const s = JSON.stringify(x);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

export interface Merged<T extends Item> {
  local: T[];
  push: T[];
  remove: string[];
  shadow: Shadow;
}

export function merge<T extends Item>(local: readonly T[], server: readonly ServerItem<T>[], shadow: Shadow, keep: (x: T) => boolean = () => true): Merged<T> {
  const out = new Map<string, T>();
  const kept = new Map<string, T>(); // local items that sync (watch hands etc. stay local only)
  for (const x of local) {
    out.set(x.id, x);
    if (keep(x)) kept.set(x.id, x);
  }
  const push: T[] = [];
  const remove: string[] = [];
  const next: Shadow = {};
  const seen = new Set<string>();

  for (const s of server) {
    seen.add(s.id);
    const mine = kept.get(s.id);
    const before = shadow[s.id];
    const changedHere = mine ? hashOf(mine) !== before : before !== undefined; // edited, or deleted here
    if (s.deleted || !s.data) {
      if (mine && changedHere && before !== undefined) push.push(mine); // edited here after it was deleted there: keep the edit
      else if (mine && before === undefined) push.push(mine); // made here, never synced
      else if (mine) out.delete(s.id); // unchanged here, deleted there
      continue;
    }
    if (!mine) {
      if (before !== undefined) remove.push(s.id); // deleted here since the last sync
      else {
        out.set(s.id, s.data);
        next[s.id] = hashOf(s.data);
      }
      continue;
    }
    if (changedHere && hashOf(mine) !== hashOf(s.data)) push.push(mine);
    else {
      out.set(s.id, s.data);
      next[s.id] = hashOf(s.data);
    }
  }
  // made here and the server never had them
  for (const [id, x] of kept) if (!seen.has(id)) push.push(x);
  return { local: [...out.values()], push, remove, shadow: next };
}
