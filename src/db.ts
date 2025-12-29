import { PrismaClient } from '@prisma/client';

// Create a single, shared instance of the PrismaClient
export const prisma = new PrismaClient();
