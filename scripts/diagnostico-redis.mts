import { Redis } from 'ioredis';
import pino from 'pino';
import 'dotenv/config';

const logger = pino({ level: 'info' });

/**
 * Este script conecta-se ao Redis e lista todas as chaves existentes.
 * É uma ferramenta de diagnóstico para verificar o estado do Redis.
 */
async function diagnosticoRedis() {
  logger.info('Iniciando diagnóstico do Redis...');

  const { REDIS_URL } = process.env;

  if (!REDIS_URL) {
    logger.fatal('REDIS_URL não definida. Abortando.');
    return;
  }

  let redis;
  try {
    logger.info('Conectando ao Redis...');
    redis = new Redis(REDIS_URL, { tls: {} });
    await redis.ping(); // Verifica se a conexão está realmente ativa
    logger.info('Conexão com o Redis estabelecida com sucesso.');

    logger.info('Buscando todas as chaves existentes...');
    const keys = await redis.keys('*');

    if (keys.length === 0) {
      logger.info('✅ O Redis está vazio. Nenhuma chave encontrada.');
    } else {
      logger.warn(`⚠️ Encontradas ${keys.length} chaves no Redis:`);
      keys.forEach(key => {
        logger.info(`  - ${key}`);
      });
    }

  } catch (error) {
    logger.error({ err: error }, 'Falha ao conectar ou buscar chaves no Redis.');
  } finally {
    if (redis) {
      await redis.quit();
      logger.info('Conexão com o Redis fechada.');
    }
  }
}

diagnosticoRedis();
