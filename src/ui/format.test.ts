import { describe, expect, test } from 'vitest';
import { CURRENCIES, formatAmount, parseAmount } from './format';

const EUR = CURRENCIES.find((c) => c.code === 'EUR')!;
const CHIPS = CURRENCIES.find((c) => c.code === 'CHIPS')!;

describe('parseAmount', () => {
  test('decimal dot and decimal comma both work', () => {
    expect(parseAmount('0.25', EUR)).toBe(25);
    expect(parseAmount('0,25', EUR)).toBe(25);
    expect(parseAmount('1,5', EUR)).toBe(150);
    expect(parseAmount(' € 2 ', EUR)).toBe(200);
    expect(parseAmount('0,', EUR)).toBe(0);
  });

  test('chips are whole units', () => {
    expect(parseAmount('1500', CHIPS)).toBe(1500);
  });

  test('rejects junk', () => {
    expect(parseAmount('', EUR)).toBeNull();
    expect(parseAmount('abc', EUR)).toBeNull();
    expect(parseAmount('-1', EUR)).toBeNull();
  });
});

describe('formatAmount', () => {
  test('money, chips and big blinds', () => {
    expect(formatAmount(2500, EUR, 25)).toBe('€25');
    expect(formatAmount(50, EUR, 25)).toBe('€0.50');
    expect(formatAmount(130000, EUR, 200)).toBe('€1,300');
    expect(formatAmount(2500, EUR, 25, 'chips')).toBe('25');
    expect(formatAmount(2500, EUR, 25, 'bb')).toBe('100 BB');
    expect(formatAmount(10, EUR, 25, 'bb')).toBe('0.4 BB');
  });
});
