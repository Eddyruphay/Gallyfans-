import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { config } from './config.js';
import logger from './logger.js';
import { runPublicationCycle } from './publisher.js';
import { getPrisma } from './db.js';
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
    return c.text('Gally Publisher - Publication Manager');
});

// Healthcheck de Liveness: Apenas informa se o processo está vivo e respondendo.
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Healthcheck de Readiness/Status: Informa o estado real das dependências.
app.get('/status', async (c) => {
  let dbStatus = 'pending';
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    dbStatus = 'ok';
  } catch (e) {
    dbStatus = 'error';
    logger.error({ err: e, msg: 'Database health check failed.' });
  }

  const isReady = dbStatus === 'ok';
  
  const status = {
    server: {
      status: 'running',
    },
    database: {
        status: dbStatus,
    },
    scheduler: {
        status: 'running',
    },
    ready: isReady,
    timestamp: new Date().toISOString(),
  };

  return c.json(status, isReady ? 200 : 503);
});

app.post('/api/trigger-cycle', (c) => {
    logger.info('[API] Ciclo de publicação acionado via API.');
    runPublicationCycle().catch(err => {
        logger.error({ err, msg: '[API] Erro assíncrono ao executar o ciclo de publicação.' });
    });
    return c.json({ success: true, message: 'Ciclo de publicação iniciado.' });
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
            logger.error({ err: result.error, stdout: result.stdout, stderr: result.stderr, msg: '[API-DEBUG] Erro ao executar comando.' });
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
        logger.error({ err: error, msg: '[API-DEBUG] Erro na rota de diagnóstico.' });
        return c.json({ success: false, message: error.message }, 500);
    }
});


// --- Inicialização ---
const startServer = async () => {
    process.on('unhandledRejection', (reason, promise) => {
        logger.error({ reason, msg: 'Unhandled Rejection at Promise. O serviço continuará, mas isso indica um bug em potencial.' });
    });

    process.on('uncaughtException', (error) => {
        logger.fatal({ err: error, msg: 'Uncaught Exception thrown. O processo será encerrado para evitar um estado inconsistente.' });
        process.exit(1);
    });

    try {
        logger.info(`[SYSTEM] Aguardando ${config.startupDelaySeconds} segundos antes de iniciar os serviços...`);

        setTimeout(async () => {
            logger.info('[SYSTEM] Atraso de inicialização concluído. Iniciando serviços principais...');
            
            const server = serve({
                fetch: app.fetch,
                port: config.port,
            }, (info) => {
                logger.info(`🚀 Gally Publisher está online na porta: ${info.port}`);
            });

            // --- Agendador Cíclico de Publicação ---
            let publicationTimeoutId: NodeJS.Timeout;
            const scheduleNextPublicationCycle = () => {
                const interval = config.publicationIntervalMinutes * 60 * 1000;
                logger.info(`[SCHEDULER] Próximo ciclo de publicação agendado para daqui a ${config.publicationIntervalMinutes} minutos.`);
                
                publicationTimeoutId = setTimeout(async () => {
                    try {
                        await runPublicationCycle();
                    } catch (err) {
                        logger.error({ err, msg: '[SCHEDULER] Erro inesperado durante a execução de runPublicationCycle.' });
                    } finally {
                        scheduleNextPublicationCycle();
                    }
                }, interval);
            };

            setTimeout(scheduleNextPublicationCycle, 5000);

            // --- Graceful Shutdown ---
            const gracefulShutdown = async (signal: string) => {
                logger.info(`Recebido sinal ${signal}. Encerrando graciosamente...`);
                
                clearTimeout(publicationTimeoutId);
                logger.info('[SCHEDULER] Ciclo de publicação futuro cancelado.');

                server.close();
                logger.info('Servidor HTTP fechado.');

                const prisma = getPrisma();
                await prisma.$disconnect().catch(err => logger.error({ err, msg: 'Erro ao desconectar do Prisma.' }));
                logger.info('Conexão com o banco de dados fechada.');
                
                logger.info('Serviços encerrados. Adeus!');
                process.exit(0);
            };

            process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
            process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        }, config.startupDelaySeconds * 1000);

    } catch (error) {
        logger.fatal({ err: error, msg: 'Falha catastrófica ao iniciar o Gally Publisher.' });
        process.exit(1);
    }
};

startServer();
