import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { runSeed } from '../src/seed/seed.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  await runSeed(prisma);
  console.log('Seed complete');
} finally {
  await prisma.$disconnect();
}
