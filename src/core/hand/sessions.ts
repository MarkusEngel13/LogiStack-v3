/**
 * Sessions: the hands of one sitting (dealt one after another with "Deal next hand", which
 * keeps the first hand's id as `session`) and how Hero did - the gym's scoreboard.
 */

import { replay } from '../engine/replay';
import type { HandRecord } from './types';

export interface SessionHand {
  hand: HandRecord;
  /** Hero's result in chips (minor units) and in big blinds. */
  net: number;
  netBB: number;
}

export interface Session {
  id: string;
  /** When it started (the first hand). */
  at: string;
  name: string;
  /** Hands with Hero's result known (played to the end, or Hero folded), in order. */
  hands: SessionHand[];
  /** Hands not finished with Hero still in (left in the middle). */
  unfinished: number;
  net: number;
  netBB: number;
  bbPer100: number;
  best: SessionHand | null;
  worst: SessionHand | null;
}

/**
 * Hero's result in a hand once it's known: the hand played to the end, or Hero folded on the way
 * (what he put in - a live hand is often left there). null: Hero still in, the hand unfinished.
 */
const heroResult = (h: HandRecord): number | null => {
  try {
    const s = replay(h);
    if (s.phase === 'complete' || (s.phase === 'showdown' && !!s.result?.resolved)) return s.result?.net[h.hero!] ?? 0;
    const me = s.seats.find((x) => x.seat === h.hero);
    return me?.folded ? me.stack - me.startStack : null;
  } catch {
    return null;
  }
};

/** Your sittings with Hero, newest first; a sitting needs two hands or more. */
export function sessions(hands: readonly HandRecord[]): Session[] {
  const groups = new Map<string, HandRecord[]>();
  for (const h of hands) {
    if (h.hero === undefined) continue;
    const key = h.session ?? h.id;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  const out: Session[] = [];
  for (const [id, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.handNo ?? 0) - (b.handNo ?? 0) || a.createdAt.localeCompare(b.createdAt));
    const done: SessionHand[] = [];
    let unfinished = 0;
    for (const hand of list) {
      const net = heroResult(hand);
      if (net === null) {
        unfinished++;
        continue;
      }
      done.push({ hand, net, netBB: net / hand.table.blinds.bb });
    }
    const net = done.reduce((t, x) => t + x.net, 0);
    const netBB = done.reduce((t, x) => t + x.netBB, 0);
    const by = [...done].sort((a, b) => b.netBB - a.netBB);
    out.push({
      id,
      at: list[0]!.createdAt,
      name: list[0]!.table.name || list[0]!.title || 'Session',
      hands: done,
      unfinished,
      net,
      netBB,
      bbPer100: done.length ? (100 * netBB) / done.length : 0,
      best: by[0] && by[0].netBB > 0 ? by[0] : null,
      worst: by.at(-1) && by.at(-1)!.netBB < 0 ? by.at(-1)! : null,
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
