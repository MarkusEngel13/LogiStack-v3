import { useMemo } from 'react';
import type { TableState } from '../../core/engine/state';
import type { HandRecord } from '../../core/hand/types';
import { storyInput, type StoryInput, type StoryStep } from '../../core/motives/story';
import type { ChartChoice } from '../../core/ranges/spot';
import { useEquity } from './useEquity';

export interface StoryView {
  /** What the model reads from the hand; null before the flop. */
  input: StoryInput | null;
  /** Every postflop action through the model; null while it works. */
  steps: StoryStep[] | null;
  pending: boolean;
  error?: string;
}

/**
 * The hand's range story (core/motives/story.ts), worked out in the background for the whole
 * hand at once, so stepping back and forth costs nothing. It changes with the actions, the ranges
 * set in the Lab and the players' types and statuses - not with hole cards (nobody sees those).
 */
export function useStory(hand: HandRecord, steps: readonly TableState[], charts: readonly ChartChoice[]): StoryView {
  const input = useMemo(() => storyInput(hand, steps, charts), [hand, steps, charts]);
  const key = JSON.stringify([
    hand.events,
    hand.ranges,
    hand.button,
    hand.players.map((p) => [p.seat, p.stack, p.playerType, p.tags]),
  ]);
  const { answer, pending } = useEquity(input ? { kind: 'story', input } : null, `story:${key}`);
  return { input, steps: answer?.story ?? null, pending, error: answer?.error };
}
