import type { AuthenticationCreds, SignalKeyStore, AuthenticationState } from '@whiskeysockets/baileys';
import { initAuthCreds } from '@whiskeysockets/baileys';
import type { Redis } from 'ioredis';
import logger from './logger.js';

// Helper to ensure Buffers are serialized and deserialized correctly from JSON
const replacer = (key: string, value: any) => {
  if (value instanceof Buffer) {
    return { type: 'Buffer', data: value.toJSON().data };
  }
  return value;
};

const reviver = (key: string, value: any) => {
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  return value;
};

const KEY_PREFIX = 'baileys-auth:';
const credsKey = `${KEY_PREFIX}creds`;
const keysKey = `${KEY_PREFIX}keys`;

/**
 * Creates a custom Baileys authentication state handler that uses ioredis.
 * This replaces the buggy 'baileys-redis-auth' library.
 */
export const useCustomRedisAuthState = async (redis: Redis): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  let creds: AuthenticationCreds;
  let keys: { [key: string]: any } = {};

  // Load credentials and keys from Redis
  const credsJson = await redis.get(credsKey);
  if (credsJson) {
    creds = JSON.parse(credsJson, reviver);
    logger.info('[AUTH_STORE] Credentials loaded from Redis.');
  } else {
    creds = initAuthCreds(); // Use the official init function
    logger.info('[AUTH_STORE] No credentials found in Redis, starting with new ones.');
  }

  const keysJson = await redis.get(keysKey);
  if (keysJson) {
    keys = JSON.parse(keysJson, reviver);
    logger.info('[AUTH_STORE] Keys loaded from Redis.');
  }

  const saveCreds = async () => {
    logger.info('[AUTH_STORE] Saving credentials and keys to Redis...');
    await redis.set(credsKey, JSON.stringify(creds, replacer));
    await redis.set(keysKey, JSON.stringify(keys, replacer));
    logger.info('[AUTH_STORE] Saved credentials and keys to Redis successfully.');
  };

  return {
    state: {
      creds,
      keys: {
        get: (type, ids) => {
          const data: { [key: string]: any } = {};
          for (const id of ids) {
            const key = `${type}-${id}`;
            if (keys[key]) {
              data[id] = keys[key];
            }
          }
          return Promise.resolve(data);
        },
        set: (data) => {
          Object.assign(keys, data);
          return Promise.resolve();
        },
      },
    },
    saveCreds,
  };
};
