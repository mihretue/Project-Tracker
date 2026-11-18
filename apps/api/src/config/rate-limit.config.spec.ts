import { resolveAuthRateLimit } from './rate-limit.config';

describe('Auth rate limit configuration', () => {
  it('defaults to 10 requests per minute per IP', () => {
    expect(resolveAuthRateLimit({})).toEqual({ ttl: 60_000, limit: 10 });
  });

  it('reads overrides from the environment', () => {
    expect(
      resolveAuthRateLimit({ AUTH_RATE_LIMIT_MAX: '25', AUTH_RATE_LIMIT_WINDOW_MS: '30000' }),
    ).toEqual({ ttl: 30_000, limit: 25 });
  });

  it('treats empty values as unset', () => {
    expect(resolveAuthRateLimit({ AUTH_RATE_LIMIT_MAX: '', AUTH_RATE_LIMIT_WINDOW_MS: ' ' })).toEqual({
      ttl: 60_000,
      limit: 10,
    });
  });

  it.each(['0', '-5', 'abc', '1.5'])('rejects an invalid limit "%s" instead of silently ignoring it', (value) => {
    expect(() => resolveAuthRateLimit({ AUTH_RATE_LIMIT_MAX: value })).toThrow(/AUTH_RATE_LIMIT_MAX/);
  });

  it('rejects an invalid window', () => {
    expect(() => resolveAuthRateLimit({ AUTH_RATE_LIMIT_WINDOW_MS: '0' })).toThrow(
      /AUTH_RATE_LIMIT_WINDOW_MS/,
    );
  });
});
