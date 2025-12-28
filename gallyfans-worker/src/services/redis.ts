import { Redis } from 'ioredis';
import { config } from '../config.js';
import logger from '../logger.js';

const redis = new Redis(config.redis.url);

const LOCK_KEY = 'gallyfans-publisher-lock';
const LOCK_TIMEOUT_SECONDS = 300; // 5 minutes

/**
 * Acquires a distributed lock using Redis.
 * @returns A unique lock value if the lock was acquired, otherwise null.
 */
export async function acquireLock(): Promise<string | null> {
  const lockValue = Date.now().toString();
  const lock = await redis.set(LOCK_KEY, lockValue, 'EX', LOCK_TIMEOUT_SECONDS, 'NX');

  if (!lock) {
    logger.warn('[REDIS] Could not acquire lock. Another cycle is likely running.');
    return null;
  }

  logger.info('[REDIS] Lock acquired.');
  return lockValue;
}

/**
 * Releases the distributed lock if the provided value matches the one in Redis.
 * @param lockValue The unique value of the lock to release.
 */
export async function releaseLock(lockValue: string) {
  if (await redis.get(LOCK_KEY) === lockValue) {
    await redis.del(LOCK_KEY);
    logger.info('[REDIS] Lock released.');
  }
}
