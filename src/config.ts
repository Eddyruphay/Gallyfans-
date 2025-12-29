import logger from './logger.js';
import 'dotenv/config';

const {
  DATABASE_URL,
  REDIS_URL, // Use a single URL for Redis
  TARGET_CHANNEL_ID,
  PORT,
  PUBLICATION_INTERVAL_MINUTES,
} = process.env;

// Validação de variáveis de ambiente essenciais
const requiredEnvVars = {
  DATABASE_URL,
  REDIS_URL, // Validate the single Redis URL
  TARGET_CHANNEL_ID,
};

const missingEnvVars = Object.entries(requiredEnvVars)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingEnvVars.length > 0) {
  logger.fatal(`The following required environment variables are missing: ${missingEnvVars.join(', ')}.`);
  process.exit(1);
}

// Configuração unificada
export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!,
  targetChannelId: process.env.TARGET_CHANNEL_ID!,
  port: Number(process.env.PORT || 3000),
  publicationIntervalMinutes: 1,
};