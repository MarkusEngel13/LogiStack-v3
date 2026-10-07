import { useEffect, useState } from 'react';
import { parsePlaybook, type Playbook } from '../../core/advice/playbook';

/**
 * The loaded playbook, kept in this browser (IndexedDB: a few MB, too big for localStorage). It is
 * the user's private copy, loaded from a file - the app never ships it. Every access is guarded:
 * storage can be blocked, then the playbook lasts for this page only.
 */
const DB = 'logistack';
const STORE = 'playbook';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function read(): Promise<Playbook | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ? parsePlaybook(req.result) : null);
    req.onerror = () => reject(req.error);
  });
}

async function write(p: Playbook | null): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const req = p ? store.put(p, KEY) : store.delete(KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// one copy for the whole page, shared by every panel
let current: Playbook | null | undefined;
const listeners = new Set<(p: Playbook | null) => void>();
const publish = (p: Playbook | null) => {
  current = p;
  listeners.forEach((l) => l(p));
};

export function usePlaybook() {
  const [playbook, setPlaybook] = useState<Playbook | null | undefined>(current);
  useEffect(() => {
    listeners.add(setPlaybook);
    if (current === undefined) {
      read()
        .then(publish)
        .catch(() => publish(null));
    }
    return () => {
      listeners.delete(setPlaybook);
    };
  }, []);

  /** Load a playbook file the user picked; throws a readable error for a wrong file. */
  const load = async (file: File) => {
    const p = parsePlaybook(JSON.parse(await file.text()));
    publish(p);
    try {
      await write(p);
    } catch {
      // storage blocked: kept for this page only
    }
    return p;
  };
  const clear = async () => {
    publish(null);
    try {
      await write(null);
    } catch {
      // nothing stored
    }
  };
  return { playbook, load, clear };
}
