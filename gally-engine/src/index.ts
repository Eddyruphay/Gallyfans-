import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { config } from './config.js';
import logger from './logger.js';
import { initWhatsApp, sendTextMessage } from './whatsapp.js';
import { runPublicationCycle } from './publisher.js';

const app = new Hono();

// --- Middlewares ---
app.use('*', honoLogger((str) => logger.info(str)));

// Middleware de Autenticação por Chave de API para todas as rotas de API
app.use('/api/*', async (c, next) => {
    const apiKey = c.req.header('X-API-KEY');
    if (apiKey !== config.apiKey) {
        logger.warn('[API] Tentativa de acesso à API com chave inválida.');
        return c.json({ success: false, message: 'Unauthorized' }, 401);
    }
    await next();
});

// --- Rotas ---
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/trigger-cycle', (c) => {
    logger.info('[API] Ciclo de publicação acionado via API.');
    // Não esperamos o resultado final, pois pode demorar.
    runPublicationCycle().catch(err => {
        logger.error({ err }, '[API] Erro assíncrono ao executar o ciclo de publicação.');
    });
    return c.json({ success: true, message: 'Ciclo de publicação iniciado.' });
});

app.post('/api/send-test-message', async (c) => {
    logger.info('[API] Mensagem de teste acionada via API.');
    try {
        const text = 'Hello Gally! A conexão está ativa e respondendo a comandos.';
        await sendTextMessage(config.targetChannelId, text);
        return c.json({ success: true, message: 'Mensagem de teste enviada.' });
    } catch (error: any) {
        logger.error({ err: error }, '[API] Erro ao enviar mensagem de teste.');
        return c.json({ success: false, message: error.message }, 500);
    }
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
