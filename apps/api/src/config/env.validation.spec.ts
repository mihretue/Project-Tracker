import { validateEnv } from './env.validation';

describe('validateEnv (JWT_SECRET startup validation)', () => {
  const strong = 'f3a9c1d7e2b44a0f9d6c8b1e5a7f2d3c4b6a8e0f1d2c3b4a5968778695a4b3c2';

  it('fails clearly when JWT_SECRET is missing', () => {
    expect(() => validateEnv({})).toThrow(/JWT_SECRET is not set/);
  });

  it('fails when JWT_SECRET is empty or whitespace', () => {
    expect(() => validateEnv({ JWT_SECRET: '' })).toThrow(/JWT_SECRET is not set/);
    expect(() => validateEnv({ JWT_SECRET: '   ' })).toThrow(/JWT_SECRET is not set/);
  });

  it('fails when JWT_SECRET is not a string', () => {
    expect(() => validateEnv({ JWT_SECRET: 12345678901234567890123456789012 })).toThrow(
      /JWT_SECRET is not set/,
    );
  });

  it('fails when JWT_SECRET is shorter than 32 characters', () => {
    expect(() => validateEnv({ JWT_SECRET: 'short-secret' })).toThrow(/too short/);
  });

  it('rejects the previously hard-coded default and typical placeholders', () => {
    expect(() => validateEnv({ JWT_SECRET: 'dev-jwt-secret-key-32-chars-minimum' })).toThrow(
      /placeholder/,
    );
    expect(() => validateEnv({ JWT_SECRET: 'please-change-me-to-a-long-random-value-1234' })).toThrow(
      /placeholder/,
    );
    expect(() => validateEnv({ JWT_SECRET: 'my-super-secret-password-value-1234567890' })).toThrow(
      /placeholder/,
    );
  });

  it('never echoes the secret in the error message', () => {
    try {
      validateEnv({ JWT_SECRET: 'dev-jwt-secret-key-32-chars-minimum' });
      fail('expected validateEnv to throw');
    } catch (error) {
      expect((error as Error).message).not.toContain('dev-jwt-secret-key-32-chars-minimum');
    }
  });

  it('accepts a strong secret and returns the config unchanged', () => {
    const config = { JWT_SECRET: strong, OTHER: 'value' };
    expect(validateEnv(config)).toBe(config);
  });
});
