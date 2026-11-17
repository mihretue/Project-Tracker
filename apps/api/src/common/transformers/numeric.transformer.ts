import { ValueTransformer } from 'typeorm';
import Decimal from 'decimal.js';

export class NumericTransformer implements ValueTransformer {
  to(data: string | number | null | undefined): string | null {
    if (data === null || data === undefined || data === '') {
      return null;
    }
    // Convert to exact 2-decimal string representation using Decimal.js
    return new Decimal(data).toFixed(2);
  }

  from(data: string | null | undefined): string | null {
    if (data === null || data === undefined) {
      return null;
    }
    // Preserve as exact decimal string to prevent binary floating-point precision loss
    return new Decimal(data).toFixed(2);
  }
}
