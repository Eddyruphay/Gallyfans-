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



/**

 * Handles leader election and starts the core worker services.

 */

async function startWorkerServices() {

  logger.info('[WORKER] Attempting to start services...');



  const isLeader = await acquireStartupLock();



  if (!isLeader) {

    logger.warn('[WORKER] Could not acquire lock. Starting as PASSIVE instance.');

    // This instance will only serve health checks and wait for promotion.

    return;

  }



  logger.info('[WORKER] Lock acquired. Starting as LEADER instance.');

  

  // Start refreshing the lock to remain leader

  startLockHeartbeat();



  try {

    // Initialize services

    await initializeWhatsApp();



    // Schedule the main task

    cron.schedule(`*/${config.publicationIntervalMinutes} * * * *`, () => {

      logger.info('[CRON] Scheduled publication cycle triggered.');

      runPublicationCycle().catch(err => {

        logger.error({ err }, '[CRON] Unhandled error in publication cycle.');

      });

    });

    logger.info(`[CRON] Publication cycle scheduled to run every ${config.publicationIntervalMinutes} minutes.`);



    // Run one cycle on startup

    logger.info('[WORKER] Running initial publication cycle...');

    runPublicationCycle().catch(err => {

      logger.error({ err }, '[WORKER] Unhandled error in initial publication cycle.');

    });



  } catch (err) {

    logger.fatal({ err }, '[WORKER] Failed to initialize services. Shutting down.');

    // Release the lock and exit to allow another instance to take over.

    await releaseStartupLock();

    process.exit(1);

  }

}



/**

 * Main application entry point.

 */

function main() {

  // Start the web server immediately for health checks.

  serve({

    fetch: app.fetch,

    port: config.port,

  }, (info: AddressInfo) => {

    logger.info(`[HTTP] Server listening on http://localhost:${info.port}`);

  });



  // Start the worker services in the background.

  // We don't await this; it runs concurrently.

  startWorkerServices().catch(err => {

    logger.fatal({ err }, '[MAIN] Unhandled error during worker service startup.');

    process.exit(1);

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

main();
