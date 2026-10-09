/**
 * The 1-5 slider grades in colour, by how strong the trait is: bright green 1, cyan 2, yellow 3,
 * orange 4, bright red 5, half steps halfway in between. Red means "high", not "bad": a red Bluffs
 * and a red Respect both jump out at once. Used wherever the sliders show: the Players page, the
 * question wizard, ✎ at the table.
 */

import type { CSSProperties } from 'react';

const STOPS: readonly [number, number, number][] = [
  [0x22, 0xe0, 0x6b], // 1 bright green
  [0x22, 0xd3, 0xee], // 2 cyan
  [0xfa, 0xcc, 0x15], // 3 yellow
  [0xfb, 0x8c, 0x1e], // 4 orange
  [0xff, 0x3b, 0x3b], // 5 bright red
];

const hex = (c: readonly number[]) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;

function rgb(v: number): number[] {
  const x = Math.max(1, Math.min(5, Number.isFinite(v) ? v : 3)) - 1;
  const i = Math.min(3, Math.floor(x));
  const t = x - i;
  return STOPS[i]!.map((a, k) => a + (STOPS[i + 1]![k]! - a) * t);
}

/** A grade's colour for fills: the slider, a badge. */
export const gradeColor = (v: number): string => hex(rgb(v));

/**
 * A grade's colour for text: as it is on the dark theme, darkened on the light one so yellow still
 * reads on white (light-dark() follows the theme's color-scheme).
 */
export function gradeText(v: number): string {
  const dark = rgb(v).map((x) => x * 0.6);
  return `light-dark(${hex(dark)}, ${gradeColor(v)})`;
}

/** A grade's number as a badge: its colour behind dark digits (readable on both themes). */
export const gradeBadge = (v: number): CSSProperties => ({ background: gradeColor(v), color: '#141414' });

/** A grade as a number: whole or half ("3", "3.5"). */
export const gradeLabel = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
