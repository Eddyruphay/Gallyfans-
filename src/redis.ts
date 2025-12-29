import { Redis } from 'ioredis';
import { config } from './config.js';
import logger from './logger.js';

// Use the single REDIS_URL for connection
const redis = new Redis(config.redisUrl, {
  tls: {}, // Required for Render Redis
  lazyConnect: true,
});

// Connect to Redis on startup
redis.connect().catch(err => {
  logger.fatal({ err }, '[REDIS] Failed to connect to Redis on startup.');
  process.exit(1);
});

const INSTANCE_LOCK_KEY = 'gallyfans-worker:instance-lock';
const LOCK_TIMEOUT_SECONDS = 30; // A 30-second lock timeout

let lockValue: string | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Acquires a distributed startup lock using Redis.
 * @returns True if the lock was acquired, false otherwise.
 */
export async function acquireStartupLock(): Promise<boolean> {
  const newLockValue = Date.now().toString();
  const result = await redis.set(INSTANCE_LOCK_KEY, newLockValue, 'EX', LOCK_TIMEOUT_SECONDS, 'NX');

  if (result === 'OK') {
    lockValue = newLockValue;
    logger.info(`[REDIS] Startup lock acquired with value: ${lockValue}`);
    return true;
  }

  logger.warn('[REDIS] Could not acquire startup lock. Another instance is likely the leader.');
  return false;
}

/**
 * Starts a heartbeat to periodically refresh the lock, ensuring this instance
 * remains the leader.
 */
export function startLockHeartbeat() {
  if (!lockValue) {
    throw new Error('Cannot start heartbeat without acquiring a lock first.');
  }

  // Refresh the lock every 10 seconds (well before the 30-second timeout)
  const refreshInterval = 10 * 1000;

  heartbeatInterval = setInterval(async () => {
    if (lockValue) {
      try {
        const currentLockValue = await redis.get(INSTANCE_LOCK_KEY);
        if (currentLockValue === lockValue) {
          await redis.expire(INSTANCE_LOCK_KEY, LOCK_TIMEOUT_SECONDS);
          logger.info(`[REDIS] Heartbeat: Lock refreshed for value: ${lockValue}`);
        } else {
          // This instance has lost the lock. It should shut down.
          logger.fatal('[REDIS] Lost lock. Another instance has taken over. Shutting down...');
          process.exit(1); // Exit gracefully
        }
      } catch (error) {
        logger.error({ err: error }, '[REDIS] Error during heartbeat lock refresh.');
      }
    }
  }, refreshInterval);
}

/**
 * Releases the startup lock. To be called on graceful shutdown.
 */
export async function releaseStartupLock() {
  if (lockValue && heartbeatInterval) {
    clearInterval(heartbeatInterval);
    try {
      const currentLockValue = await redis.get(INSTANCE_LOCK_KEY);
      if (currentLockValue === lockValue) {
        await redis.del(INSTANCE_LOCK_KEY);
        logger.info(`[REDIS] Startup lock released for value: ${lockValue}`);
      }
    } catch (error) {
      logger.error({ err: error }, '[REDIS] Error during lock release.');
    }
  }
}