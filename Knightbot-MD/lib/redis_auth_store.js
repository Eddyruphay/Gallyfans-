const { initAuthCreds } = require('@whiskeysockets/baileys');

// Helper to ensure Buffers are serialized and deserialized correctly from JSON
const replacer = (key, value) => {
  if (value instanceof Buffer) {
    return { type: 'Buffer', data: value.toJSON().data };
  }
  return value;
};

const reviver = (key, value) => {
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
 */
const useCustomRedisAuthState = async (redis) => {
  let creds;
  let keys = {};

  // Load credentials and keys from Redis
  const credsJson = await redis.get(credsKey);
  if (credsJson) {
    creds = JSON.parse(credsJson, reviver);
    console.log('[AUTH_STORE] Credentials loaded from Redis.');
  } else {
    creds = initAuthCreds(); // Use the official init function
    console.log('[AUTH_STORE] No credentials found in Redis, starting with new ones.');
  }

  const keysJson = await redis.get(keysKey);
  if (keysJson) {
    keys = JSON.parse(keysJson, reviver);
    console.log('[AUTH_STORE] Keys loaded from Redis.');
  }

  const saveCreds = async () => {
    console.log('[AUTH_STORE] Saving credentials and keys to Redis...');
    await redis.set(credsKey, JSON.stringify(creds, replacer));
    await redis.set(keysKey, JSON.stringify(keys, replacer));
    console.log('[AUTH_STORE] Saved credentials and keys to Redis successfully.');
  };

  return {
    state: {
      creds,
      keys: {
        get: (type, ids) => {
          const data = {};
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

/**
 * Clears the authentication state from Redis.
 */
const clearAuthState = async (redis) => {
  console.log('[AUTH_STORE] Clearing authentication state from Redis...');
  await redis.del(credsKey);
  await redis.del(keysKey);
  console.log('[AUTH_STORE] Authentication state cleared from Redis successfully.');
};

module.exports = { useCustomRedisAuthState, clearAuthState };
