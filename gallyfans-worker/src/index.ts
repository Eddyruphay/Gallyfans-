import type { AddressInfo } from 'node:net';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import cron from 'node-cron';
import { runPublicationCycle } from './publisher.js';
import { initializeWhatsApp } from './whatsapp/client.js';
import { acquireStartupLock, releaseStartupLock, startLockHeartbeat } from './redis.js';
import logger from './logger.js';
import { config } from './config.js';

const app = new Hono();

app.get('/health', (c) => {
  logger.info('[HTTP] Health check endpoint was hit.');
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function main() {
  logger.info('[MAIN] Attempting to start worker instance...');

  const isLeader = await acquireStartupLock();

  if (isLeader) {
    logger.info('[MAIN] Lock acquired. Starting as LEADER instance.');
    
    // Start refreshing the lock to remain leader
    startLockHeartbeat();

    // Initialize services
    await initializeWhatsApp();

    // Schedule the main task
    cron.schedule(`*/${config.publicationIntervalMinutes} * * * *`, () => {
      logger.info('[CRON] Scheduled publication cycle triggered.');
      // We don't await this because cycles can take longer than the interval
      runPublicationCycle().catch(err => {
        logger.error({ err }, '[CRON] Unhandled error in publication cycle.');
      });
    });
    logger.info(`[CRON] Publication cycle scheduled to run every ${config.publicationIntervalMinutes} minutes.`);

    // Run one cycle on startup
    logger.info('[MAIN] Running initial publication cycle...');
    runPublicationCycle().catch(err => {
      logger.error({ err }, '[MAIN] Unhandled error in initial publication cycle.');
    });

  } else {
    logger.warn('[MAIN] Could not acquire lock. Starting as PASSIVE instance.');
    // This instance will only serve health checks and wait to be promoted
    // if the leader instance fails.
  }

  // All instances run the web server for health checks
  serve({
    fetch: app.fetch,
    port: config.port,
  }, (info: AddressInfo) => {
    logger.info(`[HTTP] Server listening on http://localhost:${info.port}`);
  });
}

// --- Graceful Shutdown ---
async function gracefulShutdown(signal: string) {
  logger.warn(`[MAIN] Received ${signal}. Shutting down gracefully...`);
  await releaseStartupLock();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// --- Start Application ---
main().catch(err => {
  logger.fatal({ err }, '[MAIN] Failed to start the application.');
  process.exit(1);
});