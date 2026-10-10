import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('throws without DATABASE_URL', () => {
    expect(() => loadEnv({ JWT_SECRET: 'x' })).toThrow(/DATABASE_URL/);
  });

  it('applies defaults', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'x' });
    expect(env.PORT).toBe(3000);
    expect(env.DEMO_TOPUP).toBe(false);
  });

  it('parses DEMO_TOPUP', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'x', DEMO_TOPUP: 'true' });
    expect(env.DEMO_TOPUP).toBe(true);
  });
});
