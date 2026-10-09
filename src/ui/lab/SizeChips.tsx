import { useState } from 'react';

/** The bet sizes "what happens if" offers, in pots. */
export const SIZE_CHIPS: readonly { value: number; label: string }[] = [
  { value: 1 / 3, label: '⅓' },
  { value: 1 / 2, label: '½' },
  { value: 2 / 3, label: '⅔' },
  { value: 3 / 4, label: '¾' },
  { value: 1, label: 'pot' },
  { value: 1.5, label: '1.5×' },
];

const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
const label = (v: number) => SIZE_CHIPS.find((c) => same(c.value, v))?.label ?? `${Math.round(v * 100)}%`;

/**
 * Toggle chips for bet sizes (in pots) plus your own size in % of the pot. At least one size
 * stays on. Used by the what-if window and by Options (the default set).
 */
export function SizeChips({ value, onChange }: { value: readonly number[]; onChange: (sizes: number[]) => void }) {
  const [own, setOwn] = useState('');
  const has = (v: number) => value.some((x) => same(x, v));
  const toggle = (v: number) => {
    const next = has(v) ? value.filter((x) => !same(x, v)) : [...value, v];
    if (next.length) onChange([...next].sort((a, b) => a - b));
  };
  const custom = value.filter((v) => !SIZE_CHIPS.some((c) => same(c.value, v)));
  const addOwn = () => {
    const pct = Number(own.replace(',', '.'));
    if (pct > 0 && pct <= 500 && !has(pct / 100)) onChange([...value, pct / 100].sort((a, b) => a - b));
    setOwn('');
  };
  const chip = (v: number, on: boolean) => (
    <button
      key={v}
      type="button"
      aria-pressed={on}
      onClick={() => toggle(v)}
      className={`rounded-md border px-2 py-0.5 text-xs tabular-nums ${on ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line text-muted hover:text-ink'}`}
    >
      {label(v)}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SIZE_CHIPS.map((c) => chip(c.value, has(c.value)))}
      {custom.map((v) => chip(v, true))}
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          addOwn();
        }}
      >
        <input
          value={own}
          onChange={(e) => setOwn(e.target.value)}
          inputMode="decimal"
          placeholder="own %"
          aria-label="Your own size, in % of the pot"
          className="w-16 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-xs"
        />
        {own && (
          <button type="submit" className="rounded-md border border-line px-1.5 py-0.5 text-xs text-muted hover:text-ink">
            add
          </button>
        )}
      </form>
    </div>
  );
}
