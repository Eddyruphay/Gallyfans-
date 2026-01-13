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
  return value;
}

// Unified configuration for the Gally Publisher
export const config = {
  // Required variables
  databaseUrl: requireEnv('DATABASE_URL'),
  targetChannelId: requireEnv('TARGET_CHANNEL_ID'),
  apiKey: requireEnv('API_KEY'),
  gallySessionsApiUrl: requireEnv('GALLY_SESSIONS_API_URL'),

  // Optional variables with defaults
  port: Number(process.env.PORT || 3000),
  publicationIntervalMinutes: parseInt(process.env.PUBLICATION_INTERVAL_MINUTES || '30', 10),
  startupDelaySeconds: parseInt(process.env.STARTUP_DELAY_SECONDS || '10', 10),
};
