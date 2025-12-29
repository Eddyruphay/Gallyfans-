import logger from './logger.js';
import 'dotenv/config';

const {
  DATABASE_URL,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_USERNAME,
  REDIS_PASSWORD,
  TARGET_CHANNEL_ID,
  PORT,
  PUBLICATION_INTERVAL_MINUTES,
} = process.env;

// Validação de variáveis de ambiente essenciais
const requiredEnvVars = {
  DATABASE_URL,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD, // Username is optional, 'default' will be used if not provided
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
  databaseUrl: DATABASE_URL!,
  redisHost: REDIS_HOST!,
  redisPort: parseInt(REDIS_PORT!, 10),
  redisUsername: REDIS_USERNAME || 'default', // Default to 'default' as we discovered
  redisPassword: REDIS_PASSWORD!,
  targetChannelId: TARGET_CHANNEL_ID!,
  port: PORT ? parseInt(PORT, 10) : 3001,
  publicationIntervalMinutes: parseInt(PUBLICATION_INTERVAL_MINUTES || '15', 10),
};