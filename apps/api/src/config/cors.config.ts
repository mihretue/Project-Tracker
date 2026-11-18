import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEV_DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/**
 * Allowed browser origins come from CORS_ALLOWED_ORIGINS (comma-separated, exact match).
 * When unset: local Vite origins outside production, and no cross-origin access in production.
 */
export function resolveAllowedOrigins(env: NodeJS.ProcessEnv): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS;

  if (raw !== undefined && raw.trim() !== '') {
    return raw
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter((origin) => origin.length > 0);
  }

  return env.NODE_ENV === 'production' ? [] : DEV_DEFAULT_ORIGINS;
}

/**
 * Only listed origins receive CORS headers. Authentication uses the Authorization header (no
 * cookies), so credentialed cross-origin requests are not enabled.
 */
export function buildCorsOptions(env: NodeJS.ProcessEnv): CorsOptions {
  return {
    origin: resolveAllowedOrigins(env),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  };
}
