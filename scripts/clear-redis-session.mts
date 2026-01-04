import { Redis } from 'ioredis';
import pino from 'pino';
import 'dotenv/config';

const logger = pino({ level: 'info' });

async function clearRedisSession() {
  logger.info('Iniciando limpeza de sessão no Redis...');

  const { REDIS_URL } = process.env;

  if (!REDIS_URL) {
    logger.fatal('REDIS_URL não definida. Abortando.');
    return;
  }

  logger.info('Conectando ao Redis...');
  const redis = new Redis(REDIS_URL, { tls: {} });
  logger.info('Redis conectado.');

  logger.info('Deletando chaves de sessão "creds" e "keys"...');
  const credsDeleted = await redis.del('creds');
  const keysDeleted = await redis.del('keys');

  if (credsDeleted) {
    logger.info('Chave "creds" deletada com sucesso.');
  } else {
    logger.warn('Chave "creds" não encontrada.');
  }

  if (keysDeleted) {
    logger.info('Chave "keys" deletada com sucesso.');
  } else {
    logger.warn('Chave "keys" não encontrada.');
  }

  logger.info('🎉 Limpeza de sessão concluída!');
  await redis.quit();
}

clearRedisSession().catch(err => {
  logger.error({ err }, 'Erro fatal na limpeza da sessão');
  process.exit(1);
});
