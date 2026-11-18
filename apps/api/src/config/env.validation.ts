const MIN_JWT_SECRET_LENGTH = 32;

// Values that appeared in earlier source/docs or are typical placeholders: never acceptable.
const INSECURE_SECRET_PATTERN =
  /(dev-jwt-secret|change[-_ ]?me|replace[-_ ]?me|your[-_ ]?secret|example|password)/i;

const GENERATE_HINT =
  'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"';

/**
 * Fails application startup with a clear message when required security configuration is
 * missing or insecure. Wired into ConfigModule, so it runs before any module is created.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const secret = config.JWT_SECRET;

  if (typeof secret !== 'string' || secret.trim() === '') {
    throw new Error(
      `JWT_SECRET is not set. Define it in the environment or in apps/api/.env. ${GENERATE_HINT}`,
    );
  }

  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is too short (${secret.length} characters; at least ${MIN_JWT_SECRET_LENGTH} required). ${GENERATE_HINT}`,
    );
  }

  if (INSECURE_SECRET_PATTERN.test(secret)) {
    throw new Error(
      `JWT_SECRET looks like a placeholder or a previously published default and is not secure. ${GENERATE_HINT}`,
    );
  }

  return config;
}
