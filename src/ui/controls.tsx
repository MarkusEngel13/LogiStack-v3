import { useEffect, useState, type ReactNode } from 'react';
import type { Chips, Currency } from '../core/hand/types';
import { currencySymbol, parseAmount, toMajor } from './format';

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  title,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const styles = {
    primary: 'bg-accent text-accent-ink hover:bg-accent-strong font-semibold',
    secondary: 'bg-surface-2 text-ink hover:bg-surface-3 border border-line',
    ghost: 'text-muted hover:text-ink hover:bg-surface-2',
    danger: 'text-danger hover:bg-surface-2 border border-line',
  }[variant];
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3.5 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

// A <div>, not a <label>: a label wrapping buttons would forward clicks on its text to the first button.
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-sm font-bold tracking-wider text-ink uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded px-3 ${size === 'sm' ? 'py-1 text-xs' : 'py-1.5 text-sm'} transition-colors ${
            o.value === value ? 'bg-accent font-semibold text-accent-ink' : 'text-muted hover:bg-surface-3 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex items-start gap-3 text-left ${label ? 'w-full' : 'shrink-0'}`}
    >
      <span
        className={`relative mt-0.5 inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface-3'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
    </button>
  );
}

const inputClass =
  'w-full rounded-md border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none';

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className={inputClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

/**
 * Money input in major units. Accepts a decimal dot or comma ("0.25" or "0,25") and keeps the
 * text as typed; reports minor units.
 * commitOnBlur: report only when the field is left or Enter is pressed. Used for the blinds,
 * where every change rescales the stacks, so half-typed values like "0," must not count.
 */
export function MoneyInput({
  value,
  currency,
  onChange,
  commitOnBlur = false,
  onStep,
}: {
  value: Chips;
  currency: Currency;
  onChange: (v: Chips) => void;
  commitOnBlur?: boolean;
  /** ↑ / ↓ in the field (Shift = big step); the caller decides the step size. */
  onStep?: (direction: 1 | -1, big: boolean) => void;
}) {
  const format = (v: Chips) => {
    const major = toMajor(v, currency);
    return Number.isInteger(major) ? String(major) : major.toFixed(2); // 0.5 → "0.50"
  };
  const [text, setText] = useState(format(value));
  const [invalid, setInvalid] = useState(false);

  // Follow outside changes (e.g. stacks rescaled by new blinds) without fighting the user's typing.
  useEffect(() => {
    setText((t) => (parseAmount(t, currency) === value ? t : format(value)));
  }, [value, currency]);

  const commit = () => {
    const parsed = parseAmount(text, currency);
    if (parsed === null) setText(format(value));
    else if (parsed !== value) onChange(parsed);
    setInvalid(false);
  };

  const sym = currencySymbol(currency);
  return (
    <div className="relative">
      {sym && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-faint">{sym}</span>}
      <input
        className={`${inputClass} ${sym ? 'pl-7' : ''} ${invalid ? 'border-danger' : ''}`}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseAmount(e.target.value, currency);
          setInvalid(parsed === null);
          if (!commitOnBlur && parsed !== null) onChange(parsed);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (onStep && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            onStep(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
          }
        }}
      />
    </div>
  );
}

/** Percentage input; value is a fraction (0.05 = 5 %). Accepts a decimal comma. */
export function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(Math.round(value * 1000) / 10));
  return (
    <div className="relative">
      <input
        className={`${inputClass} pr-7`}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value.replace(',', '.'));
          if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= 0) onChange(v / 100);
        }}
        onBlur={() => setText(String(Math.round(value * 1000) / 10))}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-faint">%</span>
    </div>
  );
}

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-md border border-line bg-surface-2">
      <button type="button" className="px-2.5 py-1 text-muted hover:text-ink disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="w-7 text-center text-sm font-semibold">{value}</span>
      <button type="button" className="px-2.5 py-1 text-muted hover:text-ink disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-line bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-muted hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
