/**
 * "Smells fishy": bot moves Marius flags while watching or playing, with a note - the cases the
 * model gets wrong, kept for calibration (ROADMAP step 12). In this browser (localStorage), like
 * the hands; the hand itself is kept in the library so the move can be replayed.
 */

export interface FishyMark {
  id: string;
  at: string;
  handId: string;
  handNo?: number;
  /** The step the move was made at (the hand before it). */
  step: number;
  /** "Turn · Whale 2: Call, chance 84% · Raise 2.5x 10%". */
  move: string;
  note: string;
}

const KEY = 'logistack.fishy.v0';

export function loadFishy(): FishyMark[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as FishyMark[]) : [];
  } catch {
    return [];
  }
}

function store(marks: FishyMark[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(marks));
  } catch {
    // storage blocked: the mark is lost with the page
  }
}

export const addFishy = (m: FishyMark) => store([...loadFishy(), m]);
export const deleteFishy = (id: string) => store(loadFishy().filter((m) => m.id !== id));
