import logger from './logger.js';
import 'dotenv/config';

const {
  DATABASE_URL,
  REDIS_URL,
  TARGET_CHANNEL_ID,
  WA_SESSION_PATH,
  PORT,
  PUBLICATION_INTERVAL_MINUTES,
} = process.env;

// Validação de variáveis de ambiente essenciais
const requiredEnvVars = {
  DATABASE_URL,
  REDIS_URL,
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
  redisUrl: REDIS_URL!,
  targetChannelId: TARGET_CHANNEL_ID!,
  waSessionPath: WA_SESSION_PATH || 'baileys_auth_temp',
  port: PORT ? parseInt(PORT, 10) : 3001,
  publicationIntervalMinutes: parseInt(PUBLICATION_INTERVAL_MINUTES || '15', 10),
};
