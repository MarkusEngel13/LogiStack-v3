import type { HandRecord } from '../core/hand/types';

/**
 * Saved hands, kept in this browser for now (localStorage). Moves to IndexedDB with the Lab,
 * when hands get events and the library grows. Every access is guarded: storage can be blocked.
 */
const KEY = 'logistack.hands.v0';

export function loadHands(): HandRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HandRecord[]) : [];
  } catch {
    return [];
  }
}

function store(hands: HandRecord[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(hands));
    return true;
  } catch {
    return false;
  }
}

export const saveHand = (hand: HandRecord) => store([...loadHands().filter((h) => h.id !== hand.id), hand]);
export const deleteHand = (id: string) => store(loadHands().filter((h) => h.id !== id));
export const nextHandNo = () => Math.max(0, ...loadHands().map((h) => h.handNo ?? 0)) + 1;

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
