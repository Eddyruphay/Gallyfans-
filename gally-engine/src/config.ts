import logger from './logger.js';
import 'dotenv/config';

const {
  DATABASE_URL,
  TARGET_CHANNEL_ID,
  PORT,
  PUBLICATION_INTERVAL_MINUTES,
  WA_SESSION_BASE64,
  RENDER_API_KEY,
  RENDER_SERVICE_ID,
  API_KEY, // Chave para proteger os endpoints de trigger
  DELAY_BETWEEN_MESSAGES,
} = process.env;

// Validação de variáveis de ambiente essenciais
const requiredEnvVars = {
  DATABASE_URL,
  TARGET_CHANNEL_ID,
  API_KEY,
  WA_SESSION_BASE64, // Now mandatory
};

const missingEnvVars = Object.entries(requiredEnvVars)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingEnvVars.length > 0) {
  // The new logger.fatal will also exit the process
  logger.fatal(`The following required environment variables are missing: ${missingEnvVars.join(', ')}.`);
}

// Configuração unificada para o Gally Engine
export const config = {
  databaseUrl: DATABASE_URL!,
  targetChannelId: TARGET_CHANNEL_ID!,
  port: Number(PORT || 3000),
  publicationIntervalMinutes: Number(PUBLICATION_INTERVAL_MINUTES || 5),
  waSession: WA_SESSION_BASE64, // Pode ser undefined
  renderApiKey: RENDER_API_KEY, // Pode ser undefined
  renderServiceId: RENDER_SERVICE_ID, // Pode ser undefined
  apiKey: API_KEY!,
  delayBetweenMessages: Number(DELAY_BETWEEN_MESSAGES || 2000), // Delay de 2 segundos por padrão
};