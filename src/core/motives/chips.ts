/**
 * How the chips go in. A bot decides on a size ("half pot"), then puts in an amount the way a
 * person does: it counts the pot in its head and grabs a round stack of chips. Regs count well,
 * fish miss by a fifth either way (the profile's sizeError; drinking makes it worse). The usual
 * drift per street - fish nearer two thirds on the flop, under half later - is the habit itself
 * (profile.betHabit), so the story reads it as normal; this adds the spread around it.
 */

/** A round amount near `amount`: the biggest of 1, 2, 5 x 10^k that is at most a sixth of it. */
export function niceStep(amount: number): number {
  let step = 1;
  for (let p = 1; p <= amount; p *= 10) {
    for (const m of [1, 2, 5]) if (m * p <= amount / 6) step = m * p;
  }
  return step;
}

/** About normal, spread 1, from three draws (constant draws of 0.5 give exactly 0). */
const spread = (rand: () => number) => (rand() + rand() + rand() - 1.5) * 2;

/**
 * The amount a player puts in for a bet or raise meant to go to `to` (chips): strayed by its
 * size error, rounded to chips, kept between the legal minimum and the stack. `null` when it
 * reaches the stack (the caller makes it an all-in).
 */
export function chipsMade(to: number, error: number, limits: { minTo: number; maxTo: number }, rand: () => number = Math.random): number | null {
  const z = Math.max(-2.5, Math.min(2.5, spread(rand)));
  const meant = to * Math.exp(error * z);
  const step = niceStep(meant);
  const made = Math.max(limits.minTo, Math.round(meant / step) * step);
  return made >= limits.maxTo ? null : made;
}
