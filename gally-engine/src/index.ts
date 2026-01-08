import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { config } from './config.js';
import logger from './logger.js';
import { initWhatsApp } from './whatsapp.js';
import { runPublicationCycle } from './publisher.js';

const app = new Hono();

// --- Middlewares ---
app.use('*', honoLogger((str) => logger.info(str)));

// Middleware de Autenticação por Chave de API para rotas protegidas
app.use('/trigger-cycle', async (c, next) => {
    const apiKey = c.req.header('X-API-KEY');
    if (apiKey !== config.apiKey) {
        logger.warn('[API] Tentativa de acesso ao trigger com chave inválida.');
        return c.json({ success: false, message: 'Unauthorized' }, 401);
    }
    await next();
});

// --- Rotas ---
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/trigger-cycle', (c) => {
    logger.info('[API] Ciclo de publicação acionado via API.');
    // Não esperamos o resultado final, pois pode demorar.
    // O serviço responderá imediatamente e processará em segundo plano.
    runPublicationCycle().catch(err => {
        logger.error({ err }, '[API] Erro assíncrono ao executar o ciclo de publicação.');
    });
    return c.json({ success: true, message: 'Ciclo de publicação iniciado.' });
});

// --- Inicialização ---
const startServer = async () => {
    try {
        // Inicia a conexão com o WhatsApp em segundo plano
        await initWhatsApp();

        // Inicia o servidor HTTP
        serve({
            fetch: app.fetch,
            port: config.port,
        }, (info) => {
            logger.info(`🚀 Gally Engine está online na porta: ${info.port}`);
        });

    } catch (error) {
        logger.fatal({ err: error }, 'Falha catastrófica ao iniciar o Gally Engine.');
        process.exit(1);
    }
};

startServer();
