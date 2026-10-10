export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: number;
  NODE_ENV: string;
  DEMO_TOPUP: boolean;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((k) => !source[k]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  return {
    DATABASE_URL: source.DATABASE_URL!,
    JWT_SECRET: source.JWT_SECRET!,
    PORT: Number(source.PORT ?? 3000),
    NODE_ENV: source.NODE_ENV ?? 'development',
    DEMO_TOPUP: source.DEMO_TOPUP === 'true',
  };
}
