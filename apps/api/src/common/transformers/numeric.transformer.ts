import { ValueTransformer } from 'typeorm';

export class NumericTransformer implements ValueTransformer {
  to(data: number | string | null | undefined): string | null {
    if (data === null || data === undefined) {
      return null;
    }
    return typeof data === 'number' ? data.toFixed(2) : String(data);
  }

  from(data: string | null | undefined): number | null {
    if (data === null || data === undefined) {
      return null;
    }
    const parsed = parseFloat(data);
    return isNaN(parsed) ? null : parsed;
  }
}
