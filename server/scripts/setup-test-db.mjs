// Creates the test database (if missing) and applies migrations to it.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is not set');

const url = new URL(testUrl);
const dbName = url.pathname.slice(1);
if (!/^[a-z0-9_]+$/i.test(dbName)) throw new Error(`Unsafe database name: ${dbName}`);

const admin = new URL(testUrl);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (!rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
await client.end();

execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
});
