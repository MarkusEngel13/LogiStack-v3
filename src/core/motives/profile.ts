/**
 * Who a player is, in fear-and-greed terms: how much each motive weighs in their decisions.
 * The rule that turns these into actions is in decide.ts; the presets are starting points per
 * player type, to be calibrated against the Strategy Bible's claims and Marius's Excel.
 *
 * Units: "pots" - a weight of 0.1 is worth a tenth of the pot in the player's eyes.
 */

export interface MotiveProfile {
  name: string;
  /** Weight on what an action can win: 1 = plain EV, more = greedy. */
  greed: number;
  /** Weight on what it can lose: 1 = plain EV, more = loss-averse. Climbs past comfortBB. */
  lossAversion: number;
  /** A loss up to this many big blinds feels normal; bigger amounts weigh more (absolute money). */
  comfortBB: number;
  /** Fear of being outdrawn: weight on the lead the next cards can take (wet boards scare). */
  fear: number;
  /** Delayed gratification: value of keeping worse hands in for later streets (trappy players high). */
  trap: number;
  /** Fear of tough decisions: reluctance for lines that leave a medium hand facing a hard spot. */
  toughDecision: number;
  /** Embarrassment of a bluff that gets called and shown. */
  embarrassment: number;
  /** Liking for betting and raising (initiative). */
  aggression: number;
  /** Liking for calling ("I won't be pushed around"). */
  stickiness: number;
  /**
   * Respect for big bets (from ¾ pot up): 0 ignores the size, + reads them as strong (more on the
   * turn, most on the river: big late bets are underbluffed and recreational players know it),
   * - as bluffs.
   */
  respect: number;
  /**
   * How much they narrow the other's range from what the other does (the action and its size):
   * 0 = they think about their own hand only, 1 = they read every action. Recreational players
   * think about their own hand ("I have top pair") - HHP's inelastic callers.
   */
  rangeReading: number;
  /** Probability weighting (Tversky-Kahneman γ): 1 = none; lower overweights long shots (draws, hero calls). */
  longShot: number;
  /** How much they think others fold to big bets: 1 = the population's rule of thumb. */
  foldBelief: number;
  /** How loosely the better option wins (softmax temperature, pots). */
  noise: number;
}

/** Plain expected value, no psychology: the reference the tests compare against. */
export const NEUTRAL: MotiveProfile = {
  name: 'Neutral',
  greed: 1,
  lossAversion: 1,
  comfortBB: Infinity,
  fear: 0,
  trap: 0,
  toughDecision: 0,
  embarrassment: 0,
  aggression: 0,
  stickiness: 0,
  respect: 0,
  rangeReading: 1,
  longShot: 1,
  foldBelief: 1,
  noise: 0.002,
};

const base = (name: string, p: Partial<MotiveProfile>): MotiveProfile => ({ ...NEUTRAL, noise: 0.06, comfortBB: 100, ...p, name });

/**
 * The wizard's player types. Fish = HHP's typical live recreational player: fast-plays value out
 * of fear, passive with draws, sticky, overweights long shots, hates tough decisions.
 */
export const MOTIVE_PRESETS: Record<string, MotiveProfile> = {
  Reg: base('Reg', { lossAversion: 1.2, fear: 0.6, trap: 0.8, toughDecision: 0.15, embarrassment: 1.3, aggression: 0.02, respect: 0.3, rangeReading: 0.75, longShot: 0.9 }),
  TAG: base('TAG', { lossAversion: 1.25, fear: 0.6, trap: 0.7, toughDecision: 0.15, embarrassment: 1.2, aggression: 0.04, respect: 0.35, rangeReading: 0.75, longShot: 0.9 }),
  LAG: base('LAG', { greed: 1.05, lossAversion: 1, comfortBB: 150, fear: 0.4, trap: 0.5, toughDecision: 0.1, embarrassment: 0.3, aggression: 0.08, stickiness: 0.02, respect: 0.15, rangeReading: 0.6, longShot: 0.85, foldBelief: 1.2, noise: 0.07 }),
  Nit: base('Nit', { greed: 0.95, lossAversion: 1.8, comfortBB: 40, fear: 1, trap: 0.9, toughDecision: 0.3, embarrassment: 2, aggression: -0.03, stickiness: -0.02, respect: 0.6, rangeReading: 0.4, longShot: 0.8 }),
  Fish: base('Fish', { greed: 1.1, lossAversion: 1.4, comfortBB: 50, fear: 1.2, trap: 1, toughDecision: 0.4, embarrassment: 1.5, aggression: -0.02, stickiness: 0.06, respect: 0.4, rangeReading: 0.2, longShot: 0.7, foldBelief: 0.9, noise: 0.1 }),
  Whale: base('Whale', { greed: 1.1, lossAversion: 1.1, comfortBB: 200, fear: 0.6, trap: 1, toughDecision: 0.2, embarrassment: 0.8, stickiness: 0.15, respect: -0.1, rangeReading: 0.1, longShot: 0.6, foldBelief: 0.8, noise: 0.12 }),
  Maniac: base('Maniac', { greed: 1.2, lossAversion: 0.8, comfortBB: 300, fear: 0.4, trap: 0.3, toughDecision: 0.1, embarrassment: 0.1, aggression: 0.2, stickiness: 0.05, respect: -0.3, rangeReading: 0.2, longShot: 0.7, foldBelief: 1.4, noise: 0.15 }),
};
MOTIVE_PRESETS.Unknown = { ...MOTIVE_PRESETS.Reg!, name: 'Unknown' };

export interface PlayerState {
  /** The wizard's statuses: 'winning', 'stuck', 'tilt', 'drinking' (lively), 'drinking-tired'. */
  tags?: readonly string[];
  /** Won (+) or lost (-) this session, in big blinds: losses make players chase. */
  sessionBB?: number;
}

/** A seat's profile: the preset for its player type (Unknown when none) shifted by its statuses. */
export function profileFor(seat: { playerType?: string; tags?: readonly string[] }): MotiveProfile {
  const preset = MOTIVE_PRESETS[seat.playerType || 'Unknown'] ?? MOTIVE_PRESETS.Unknown!;
  return withState(preset, { tags: seat.tags });
}

export function withState(p: MotiveProfile, s: PlayerState = {}): MotiveProfile {
  const tags = s.tags ?? [];
  let q = { ...p };
  const tired = tags.includes('drinking-tired');
  const drinking = tired || tags.includes('drinking');
  if (tags.includes('winning')) {
    // protecting the win (Marius's simulator; Eil & Lien 2014: less risk when ahead)
    q = { ...q, lossAversion: q.lossAversion * 1.2, comfortBB: q.comfortBB * 0.8, embarrassment: q.embarrassment + 0.05 };
  }
  if (tags.includes('tilt')) {
    q = { ...q, lossAversion: q.lossAversion * 0.75, fear: q.fear * 0.8, aggression: q.aggression + 0.08, stickiness: q.stickiness + 0.05, rangeReading: q.rangeReading * 0.7, longShot: q.longShot * 0.9, noise: q.noise + 0.05 };
  }
  // Drinking, from the research (docs/ROADMAP.md, Phase 1 step 3): less loss aversion, long shots
  // overweighted, less embarrassment, noisier; lively (rising alcohol, stimulant) adds aggression,
  // tired (falling alcohol, sedative) turns it into calling.
  if (drinking) {
    // alcohol myopia: attention narrows to the most salient cue - their own hand, not the other's actions
    q = { ...q, lossAversion: q.lossAversion * 0.85, comfortBB: q.comfortBB * 1.3, embarrassment: q.embarrassment * 0.7, rangeReading: q.rangeReading * 0.7, longShot: q.longShot * 0.9, noise: q.noise + 0.04 };
    q = tired ? { ...q, aggression: q.aggression - 0.12, stickiness: q.stickiness + 0.12 } : { ...q, aggression: q.aggression + 0.04 };
  }
  // behind in the session: chasing (break-even effect; stronger after drinking - Tobias-Webb et al.
  // 2019). HHP: a stuck player "just wants to get his money back so bad" and won't fold made hands
  // - don't bluff him, value-bet him thin (HHP-dq1Jn4HfegA-25, HHP-5I3oId9IV9k-43, HHP-JqjtIXgR-kI-20)
  if (tags.includes('stuck') || (s.sessionBB ?? 0) < -30) {
    q = { ...q, lossAversion: q.lossAversion * (drinking ? 0.75 : 0.85), longShot: q.longShot * 0.95, stickiness: q.stickiness + 0.03 };
  }
  return q;
}
