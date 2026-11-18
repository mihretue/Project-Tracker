import { Transform } from 'class-transformer';
import Decimal from 'decimal.js';

/**
 * Money columns are NUMERIC(14,2): at most 12 integer digits and 2 decimal places.
 * Values outside that range are rejected up front (400) instead of reaching the database (500),
 * and values with more than 2 decimals are rejected instead of being silently rounded.
 */
export const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export const moneyMessage = (label: string): string =>
  `${label} must be a non-negative amount with at most 12 digits before and 2 digits after the decimal point (e.g. 150000.00)`;

/**
 * Normalises JSON numbers to their exact decimal string WITHOUT rounding (so 123.456 stays
 * "123.456" and is then rejected by MONEY_PATTERN), and passes strings through unchanged.
 */
export const MoneyInput = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? new Decimal(value).toFixed() : String(value);
    }
    return typeof value === 'string' ? value.trim() : String(value);
  });
