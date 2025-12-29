import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    if (!process.env.DATABASE_URL) {
      // This will crash the app with a clear error if the env var is missing
      throw new Error('DATABASE_URL not found in environment variables!');
    }
    prisma = new PrismaClient();
  }
  return prisma;
}