import { buildCorsOptions, resolveAllowedOrigins } from './cors.config';

describe('CORS configuration', () => {
  it('uses the explicit CORS_ALLOWED_ORIGINS list, trimmed and without trailing slashes', () => {
    expect(
      resolveAllowedOrigins({
        CORS_ALLOWED_ORIGINS: ' https://app.example.test/ , https://admin.example.test ',
      }),
    ).toEqual(['https://app.example.test', 'https://admin.example.test']);
  });

  it('defaults to local Vite origins outside production', () => {
    expect(resolveAllowedOrigins({ NODE_ENV: 'development' })).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
    expect(resolveAllowedOrigins({})).toContain('http://localhost:5173');
  });

  it('allows no cross-origin access in production unless configured', () => {
    expect(resolveAllowedOrigins({ NODE_ENV: 'production' })).toEqual([]);
    expect(resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: '  ' })).toEqual([]);
  });

  it('treats an explicit list as authoritative even in development', () => {
    expect(
      resolveAllowedOrigins({ NODE_ENV: 'development', CORS_ALLOWED_ORIGINS: 'https://x.example.test' }),
    ).toEqual(['https://x.example.test']);
  });

  it('never enables a wildcard origin or credentialed requests', () => {
    const options = buildCorsOptions({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://a.test' });
    expect(options.origin).toEqual(['https://a.test']);
    expect(options.origin).not.toBe(true);
    expect(options.origin).not.toBe('*');
    expect(options.credentials).toBe(false);
  });
});
