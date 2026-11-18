export interface AuthRateLimit {
  /** Window length in milliseconds. */
  ttl: number;
  /** Maximum requests per client IP per window, applied separately to login and registration. */
  limit: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 10;

function positiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}".`);
  }
  return value;
}

/** Defaults to 10 requests per minute per IP; override with AUTH_RATE_LIMIT_MAX / _WINDOW_MS. */
export function resolveAuthRateLimit(env: NodeJS.ProcessEnv): AuthRateLimit {
  return {
    ttl: positiveInt('AUTH_RATE_LIMIT_WINDOW_MS', env.AUTH_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),
    limit: positiveInt('AUTH_RATE_LIMIT_MAX', env.AUTH_RATE_LIMIT_MAX, DEFAULT_MAX_REQUESTS),
  };
}
