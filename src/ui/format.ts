import type { Chips, Currency } from '../core/hand/types';

export interface CurrencyOption extends Currency {
  symbol: string;
  label: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'EUR', minorPerMajor: 100, symbol: '€', label: 'EUR €' },
  { code: 'USD', minorPerMajor: 100, symbol: '$', label: 'USD $' },
  { code: 'GBP', minorPerMajor: 100, symbol: '£', label: 'GBP £' },
  { code: 'CHIPS', minorPerMajor: 1, symbol: '', label: 'Chips' },
];

export const currencySymbol = (c: Currency) => CURRENCIES.find((x) => x.code === c.code)?.symbol ?? '';

export const toMajor = (amount: Chips, c: Currency) => amount / c.minorPerMajor;
export const fromMajor = (value: number, c: Currency): Chips => Math.round(value * c.minorPerMajor);

function number(value: number, maxDecimals: number): string {
  const decimals = Number.isInteger(value) ? 0 : maxDecimals;
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** How amounts are shown (Options modal): "€200", "200" or "100 BB". */
export type AmountDisplay = 'currency' | 'chips' | 'bb';

export function formatAmount(amount: Chips, c: Currency, bb: Chips, display: AmountDisplay = 'currency'): string {
  if (display === 'bb') {
    const v = amount / bb;
    return `${number(Math.round(v * 10) / 10, 1)} BB`;
  }
  const text = number(toMajor(amount, c), c.minorPerMajor === 1 ? 0 : 2);
  if (display === 'chips') return text;
  const sym = currencySymbol(c);
  return sym ? `${sym}${text}` : text;
}

/** Parses "2", "2.5" or "2,5" (German decimal comma) into minor units; null if invalid. */
export function parseAmount(text: string, c: Currency): Chips | null {
  const cleaned = text.trim().replace(/[€$£\s]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return fromMajor(value, c);
}
