import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { config } from './config.js';
import logger from './logger.js';
import { getPrisma } from './db.js';
import { initWhatsApp, sendTextMessage, getWAConnectionState, closeWhatsApp } from './whatsapp.js';

// ... (código existente) ...

// --- Inicialização ---
const startServer = async () => {
    // Adiciona listeners para capturar erros não tratados que podem derrubar o processo.
    // Uma prática madura para garantir que o serviço seja resiliente e observável.
    process.on('unhandledRejection', (reason, promise) => {
        logger.error({ reason }, 'Unhandled Rejection at Promise. O serviço continuará, mas isso indica um bug em potencial.');
    });

    process.on('uncaughtException', (error) => {
        logger.fatal({ err: error }, 'Uncaught Exception thrown. O processo será encerrado para evitar um estado inconsistente.');
        // Em caso de exceção não capturada, a melhor prática é encerrar o processo,
        // pois o estado da aplicação pode estar corrompido.
        process.exit(1);
    });

    try {
        // Inicia a conexão com o WhatsApp em segundo plano
        await initWhatsApp();

        // Inicia o servidor HTTP
        const server = serve({
            fetch: app.fetch,
            port: config.port,
        }, (info) => {
            logger.info(`🚀 Gally Engine está online na porta: ${info.port}`);
        });

        // --- Agendador Cíclico de Publicação ---
        // Usa um setTimeout encadeado para criar um ciclo robusto que não se sobrepõe.
        // É mais seguro que setInterval para tarefas assíncronas de longa duração.
        let publicationTimeoutId: NodeJS.Timeout;
        const scheduleNextPublicationCycle = () => {
            const interval = config.publicationIntervalMinutes * 60 * 1000;
            logger.info(`[SCHEDULER] Próximo ciclo de publicação agendado para daqui a ${config.publicationIntervalMinutes} minutos.`);
            
            publicationTimeoutId = setTimeout(async () => {
                try {
                    await runPublicationCycle();
                } catch (err) {
                    logger.error({ err }, '[SCHEDULER] Erro inesperado durante a execução de runPublicationCycle.');
                } finally {
                    // Agenda a próxima execução independentemente do resultado.
                    scheduleNextPublicationCycle();
                }
            }, interval);
        };

        // Inicia o primeiro ciclo de publicação um pouco depois do startup.
        setTimeout(scheduleNextPublicationCycle, 5000); // Delay inicial de 5s


        // --- Graceful Shutdown ---
        // Uma prática essencial para sistemas de produção. Garante que o serviço
        // encerre suas conexões (DB, WhatsApp) de forma limpa antes de morrer.
        const gracefulShutdown = async (signal: string) => {
            logger.info(`Recebido sinal ${signal}. Encerrando graciosamente...`);
            
            // 0. Cancela o próximo ciclo de publicação agendado
            clearTimeout(publicationTimeoutId);
            logger.info('[SCHEDULER] Ciclo de publicação futuro cancelado.');

            // 1. Para de aceitar novas conexões HTTP
            server.close();
            logger.info('Servidor HTTP fechado.');

            // 2. Fecha a conexão com o WhatsApp
            await closeWhatsApp();

            // 3. Desconecta do banco de dados
            const prisma = getPrisma();
            await prisma.$disconnect().catch(err => logger.error({ err }, 'Erro ao desconectar do Prisma.'));
            logger.info('Conexão com o banco de dados fechada.');
            
            logger.info('Serviços encerrados. Adeus!');
            process.exit(0);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Sinal do Render/Docker
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Sinal de Ctrl+C

    } catch (error) {
        logger.fatal({ err: error }, 'Falha catastrófica ao iniciar o Gally Engine.');
        process.exit(1);
    }
};

startServer();
