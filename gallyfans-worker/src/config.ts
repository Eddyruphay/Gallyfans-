import logger from './logger.js';
import 'dotenv/config';

const {
  DATABASE_URL,
  TARGET_CHANNEL_ID,
  REDIS_URL,
  WA_PHONE_NUMBER,
  PORT,
  PUBLICATION_INTERVAL_MINUTES
} = process.env;

// Validação de variáveis de ambiente essenciais
const requiredEnvVars = {
  DATABASE_URL,
  TARGET_CHANNEL_ID,
  WA_PHONE_NUMBER,
  REDIS_URL,
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
  targetChannelId: TARGET_CHANNEL_ID!,
  waPhoneNumber: WA_PHONE_NUMBER!,
  port: PORT ? parseInt(PORT, 10) : 3000,
  publicationIntervalMs: (parseInt(PUBLICATION_INTERVAL_MINUTES || '15', 10)) * 60 * 1000,
  redis: {
    url: REDIS_URL!,
  }
};