import logger from './logger.js';
import 'dotenv/config';

const {
  DATABASE_URL,
  TARGET_CHANNEL_ID,
  REDIS_URL,
  WA_PHONE_NUMBER,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_USERNAME,
  REDIS_PASSWORD,
  PORT,
  PUBLICATION_INTERVAL_MINUTES
} = process.env;

// Validação de variáveis de ambiente essenciais
const requiredEnvVars = {
  DATABASE_URL,
  TARGET_CHANNEL_ID,
  WA_PHONE_NUMBER,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_USERNAME,
  REDIS_PASSWORD,
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
    url: REDIS_URL, // For simple Redis connections if needed
    options: { // For Baileys Redis Auth and other detailed connections
      host: REDIS_HOST!,
      port: parseInt(REDIS_PORT!, 10),
      username: REDIS_USERNAME!,
      password: REDIS_PASSWORD!,
      tls: {
        rejectUnauthorized: false, // As seen in the original gateway
      },
      maxRetriesPerRequest: 20,
    }
  }
};
