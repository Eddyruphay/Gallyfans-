import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { config } from './config.js';
import logger from './logger.js';
import { initWhatsApp, sendTextMessage, getWAConnectionState, closeWhatsApp, sendAlbum } from './whatsapp.js';
import { exec } from 'child_process';

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

app.get('/', (c) => {
    return c.text('Gally Sessions - WhatsApp Connection Manager');
});

// Healthcheck de Liveness: Apenas informa se o processo está vivo e respondendo.
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Healthcheck de Readiness/Status: Informa o estado real das dependências.
app.get('/status', (c) => {
  const waState = getWAConnectionState();
  const isReady = waState === 'OPEN';
  
  const status = {
    server: {
      status: 'running',
    },
    whatsapp: {
      status: waState,
    },
    ready: isReady,
    timestamp: new Date().toISOString(),
  };

  return c.json(status);
});

app.post('/api/send-album', async (c) => {
    try {
        const { jid, caption, imageUrls } = await c.req.json();
        if (!jid || !imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
            return c.json({ success: false, message: 'Parâmetros inválidos. "jid" e "imageUrls" (array não vazio) são obrigatórios.' }, 400);
        }
        logger.info({ jid, imageCount: imageUrls.length }, '[API] Recebida solicitação para enviar álbum.');
        
        // Não aguarda o fim do envio para responder rapidamente
        sendAlbum(jid, caption, imageUrls).catch(err => {
            logger.error({ err, jid }, '[API] Erro assíncrono ao enviar álbum.');
        });

        return c.json({ success: true, message: 'Solicitação de envio de álbum recebida.' });
    } catch (error: any) {
        logger.error({ err: error }, '[API] Erro ao processar a solicitação /api/send-album.');
        return c.json({ success: false, message: 'Erro interno do servidor.' }, 500);
    }
});

app.post('/api/send-message', async (c) => {
    try {
        const { jid, text } = await c.req.json();
        if (!jid || !text) {
            return c.json({ success: false, message: 'Parâmetros inválidos. "jid" e "text" são obrigatórios.' }, 400);
        }
        logger.info({ jid }, '[API] Recebida solicitação para enviar mensagem de texto.');

        // Não aguarda o fim do envio
        sendTextMessage(jid, text).catch(err => {
            logger.error({ err, jid }, '[API] Erro assíncrono ao enviar mensagem de texto.');
        });

        return c.json({ success: true, message: 'Solicitação de envio de mensagem de texto recebida.' });
    } catch (error: any) {
        logger.error({ err: error }, '[API] Erro ao processar a solicitação /api/send-message.');
        return c.json({ success: false, message: 'Erro interno do servidor.' }, 500);
    }
});


// Rota de diagnóstico para executar comandos remotamente
app.post('/api/debug-exec', async (c) => {
    logger.info('[API] Rota de diagnóstico acionada.');
    try {
        const { command } = await c.req.json();
        if (!command) {
            return c.json({ success: false, message: 'Comando não fornecido.' }, 400);
        }

        logger.info(`[API-DEBUG] Executando comando: ${command}`);

        const result = await new Promise<{ error: Error | null; stdout: string; stderr: string }>((resolve) => {
            exec(command, (error, stdout, stderr) => {
                resolve({ error, stdout, stderr });
            });
        });

        if (result.error) {
            logger.error({ err: result.error, stdout: result.stdout, stderr: result.stderr }, '[API-DEBUG] Erro ao executar comando.');
            return c.json({
                success: false,
                message: result.error.message,
                stdout: result.stdout,
                stderr: result.stderr,
            }, 500);
        }

        logger.info({ stdout: result.stdout, stderr: result.stderr }, '[API-DEBUG] Comando executado com sucesso.');
        return c.json({ success: true, stdout: result.stdout, stderr: result.stderr });

    } catch (error: any) {
        logger.error({ err: error }, '[API-DEBUG] Erro na rota de diagnóstico.');
        return c.json({ success: false, message: error.message }, 500);
    }
});


// --- Inicialização ---
const startServer = async () => {
    process.on('unhandledRejection', (reason, promise) => {
        logger.error({ reason }, 'Unhandled Rejection at Promise. O serviço continuará, mas isso indica um bug em potencial.');
    });

    process.on('uncaughtException', (error) => {
        logger.fatal({ err: error }, 'Uncaught Exception thrown. O processo será encerrado para evitar um estado inconsistente.');
        process.exit(1);
    });

    try {
        logger.info(`[SYSTEM] Aguardando ${config.startupDelaySeconds} segundos antes de iniciar os serviços...`);

        setTimeout(async () => {
            logger.info('[SYSTEM] Atraso de inicialização concluído. Iniciando serviços principais...');
            
            await initWhatsApp();

            const server = serve({
                fetch: app.fetch,
                port: config.port,
            }, (info) => {
                logger.info(`🚀 Gally Sessions está online na porta: ${info.port}`);
            });

            // --- Graceful Shutdown ---
            const gracefulShutdown = async (signal: string) => {
                logger.info(`Recebido sinal ${signal}. Encerrando graciosamente...`);
                
                server.close();
                logger.info('Servidor HTTP fechado.');

                await closeWhatsApp();
                
                logger.info('Serviços encerrados. Adeus!');
                process.exit(0);
            };

            process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
            process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        }, config.startupDelaySeconds * 1000);

    } catch (error) {
        logger.fatal({ err: error }, 'Falha catastrófica ao iniciar o Gally Sessions.');
        process.exit(1);
    }
};

startServer();
