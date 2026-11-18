import axios from 'axios';

/**
 * Turns an API failure into a message a person can act on. Useful backend messages are kept;
 * technical failures (network, 5xx) and a few terse backend strings are translated.
 */
export function describeApiError(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  if (!err.response) return 'Cannot reach the server. Check your connection and try again.';

  const { status, data } = err.response;
  if (status >= 500) return 'Something went wrong on the server. Please try again.';

  const raw: unknown = data?.message;
  const message = Array.isArray(raw) ? raw.join('. ') : typeof raw === 'string' ? raw : '';
  if (!message) return fallback;

  if (/target user not found/i.test(message)) {
    return 'No registered user has that email address. Ask them to create an account first.';
  }
  if (status === 403 && /requires \[ADMIN\]/i.test(message)) {
    return 'Only organization admins can do this.';
  }
  return message;
}
