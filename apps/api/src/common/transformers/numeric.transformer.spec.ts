import { NumericTransformer } from './numeric.transformer';

describe('NumericTransformer', () => {
  let transformer: NumericTransformer;

  beforeEach(() => {
    transformer = new NumericTransformer();
  });

  it('should transform numeric value to 2-decimal string for DB storage', () => {
    expect(transformer.to(1250000.5)).toBe('1250000.50');
    expect(transformer.to(0)).toBe('0.00');
    expect(transformer.to(null)).toBeNull();
    expect(transformer.to(undefined)).toBeNull();
  });

  it('should parse database string back to number for application use', () => {
    expect(transformer.from('1250000.50')).toBe(1250000.5);
    expect(transformer.from('0.00')).toBe(0);
    expect(transformer.from(null)).toBeNull();
    expect(transformer.from(undefined)).toBeNull();
  });
});
