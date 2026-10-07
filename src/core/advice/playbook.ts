/**
 * The playbook: the Strategy Bible streamlined into pieces of advice, each tied to the moments of
 * a hand it applies to (`when`, in the words of spot.ts). The playbook itself is private study
 * material built from the creators' videos: it never ships with the app - the user loads it from
 * their own copy (Strategy Bible folder, `playbook/*.json`).
 */

import type { Dimension, SpotTags } from './spot';

export interface PlaybookSource {
  claim: string;
  video: string;
  title?: string;
  /** The video at the moment (YouTube link with &t=). */
  url?: string;
  speaker?: string;
  quote?: string;
}

export interface PlaybookEntry {
  id: string;
  title: string;
  /** What to do. */
  advice: string;
  /** What the opponent does here and why. */
  read?: string;
  /** What drives the opponent: fear-outdrawn, greed-value, ... (decide.ts's motives in HHP's words). */
  motive?: string | null;
  /** The coaches' own words for it. */
  said?: string | null;
  caveat?: string | null;
  /** The moments it applies to; absent for general advice (mental game, study, bankroll). */
  when?: Partial<Record<Dimension, string[]>>;
  /** Distinct videos that say it. */
  strength: number;
  sources: PlaybookSource[];
}

export interface Playbook {
  format: 'logistack.playbook/1';
  name: string;
  built: string;
  entries: PlaybookEntry[];
}

export interface AdviceMatch {
  entry: PlaybookEntry;
  /** How many of the moment's dimensions it names (the more specific, the more relevant). */
  specificity: number;
  score: number;
}

/**
 * The advice for a moment: every entry whose `when` fits (each dimension it names must share a
 * value with the moment's tags), the most specific first, then the best sourced. General advice
 * (no `when`) never shows up here.
 */
export function matchAdvice(entries: readonly PlaybookEntry[], tags: SpotTags, limit = 3): AdviceMatch[] {
  const out: AdviceMatch[] = [];
  for (const entry of entries) {
    const when = entry.when;
    if (!when) continue;
    let specificity = 0;
    let fits = true;
    for (const [dim, wanted] of Object.entries(when) as [Dimension, string[]][]) {
      if (!wanted?.length) continue;
      const have = tags[dim] ?? [];
      if (!wanted.some((v) => have.includes(v))) {
        fits = false;
        break;
      }
      specificity++;
    }
    if (!fits || specificity === 0) continue;
    out.push({ entry, specificity, score: specificity + 0.5 * Math.log2(1 + entry.strength) });
  }
  return out.sort((a, b) => b.score - a.score || b.entry.strength - a.entry.strength).slice(0, limit);
}

/** A loaded file, checked enough not to break the screen (a wrong file is refused, not half-used). */
export function parsePlaybook(raw: unknown): Playbook {
  const p = raw as Partial<Playbook>;
  if (!p || p.format !== 'logistack.playbook/1' || !Array.isArray(p.entries)) {
    throw new Error('Not a LogiStack playbook (format logistack.playbook/1).');
  }
  const entries = p.entries.filter((e): e is PlaybookEntry => !!e && typeof e.title === 'string' && typeof e.advice === 'string' && Array.isArray(e.sources));
  return { format: 'logistack.playbook/1', name: p.name ?? 'Playbook', built: p.built ?? '', entries };
}
