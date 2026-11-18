process.env.NODE_ENV = 'test';
process.env.POSTGRES_DB = process.env.POSTGRES_TEST_DB || 'tenant_project_tracker_test';

// Test-only values (not usable against any real deployment). Startup validation requires a
// strong JWT secret, and the suites register many users from one IP, so the login/registration
// rate limit is relaxed here; rate-limiting.e2e-spec.ts sets its own small limit.
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'e2e-test-only-jwt-signing-key-0123456789abcdefghijklmnop';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || '1000';
