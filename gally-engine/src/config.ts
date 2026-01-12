import logger from './logger.js';
import 'dotenv/config';

/**
 * Reads an environment variable, throwing an error if it's not set.
 * This ensures that from this point on, the type is inferred as `string`.
 * @param key The environment variable key.
 * @returns The value of the environment variable.
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    // logger.fatal will exit the process, this is the "fail-fast" contract.
    logger.fatal(`Missing required environment variable: ${key}`);
    // The throw is for TypeScript's benefit to understand this function never returns undefined.
    throw new Error(`Missing required environment variable: ${key}`);
  }
  if (key === 'WA_SESSION_BASE64') {
    logger.info(`[CONFIG] WA_SESSION_BASE64 loaded with length: ${value.length}`);
  }
  return value;
}

// Unified configuration for the Gally Engine
export const config = {
  // Required variables
  databaseUrl: requireEnv('DATABASE_URL'),
  targetChannelId: requireEnv('TARGET_CHANNEL_ID'),
  apiKey: requireEnv('API_KEY'),
  waSession: requireEnv('WA_SESSION_BASE64'), // Correctly inferred as `string`

  // Optional variables with defaults
  port: Number(process.env.PORT || 3000),
    publicationIntervalMinutes: parseInt(process.env.PUBLICATION_INTERVAL_MINUTES || '30', 10),
    delayBetweenMessages: parseInt(process.env.DELAY_BETDEN_MESSAGES || '2000', 10),

    // Configuração do Proxy (Opcional)
    proxyUrl: process.env.PROXY_URL,
    proxyUsername: process.env.PROXY_USERNAME,
    proxyPassword: process.env.PROXY_PASSWORD,
};
