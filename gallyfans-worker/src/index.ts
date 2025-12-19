import type { AddressInfo } from 'node:net';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import cron from 'node-cron';
import { runPublicationCycle } from './publisher.js';
import connectToWhatsApp from './whatsapp/client.js';
import logger from './logger.js';
import { config } from './config.js';

const app = new Hono();

// Endpoint raiz para health check e confirmação
app.get('/', (c) => {
  logger.info('[HTTP] Root endpoint was hit. Service is running.');
  return c.text('Gallyfans Worker is alive!');
});

app.get('/health', (c) => {
  logger.info('[HTTP] Health check endpoint was hit.');
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});


async function startServerAndScheduler() {
  try {
    logger.info('[MAIN] Initializing service...');
    const whatsappClient = await connectToWhatsApp();
    logger.info('[MAIN] WhatsApp client connection process initiated.');

    // Agenda a tarefa para rodar no intervalo configurado
    cron.schedule(`*/${config.publicationIntervalMs / 60000} * * * *`, () => {
      logger.info('[CRON] Scheduled publication cycle triggered.');
      runPublicationCycle(whatsappClient);
    });
    logger.info(`[CRON] Publication cycle scheduled to run every ${config.publicationIntervalMs / 60000} minutes.`);

    // Executa um ciclo inicial logo após o boot
    logger.info('[MAIN] Running initial publication cycle...');
    await runPublicationCycle(whatsappClient);

    // Inicia o servidor HTTP
    serve({
      fetch: app.fetch,
      port: config.port,
    }, (info: AddressInfo) => {
        logger.info(`[HTTP] Server listening on http://localhost:${info.port}`);
    });

  } catch (error) {
    logger.fatal({ err: error }, '[MAIN] Failed to start the application.');
    process.exit(1);
  }
}

startServerAndScheduler();
