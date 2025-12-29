import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import redisAuthState from 'baileys-redis-auth';
import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ level: 'info' });

const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

async function migrateSession() {
  logger.info('Iniciando migração de sessão de arquivos para Redis...');

  if (!REDIS_PASSWORD) {
    logger.fatal('REDIS_PASSWORD não definida. Abortando.');
    return;
  }

  // 1️⃣ Ler sessão local
  logger.info('Lendo sessão da pasta "baileys_auth_temp"...');
  const { state: fileState } = await useMultiFileAuthState('baileys_auth_temp');

  if (!fileState.creds?.registered) {
    logger.fatal('Sessão local não registrada. Autentique primeiro.');
    return;
  }

  logger.info('Sessão local lida com sucesso.');

  // 2️⃣ Conectar Redis (forma correta para Render)
  logger.info('Conectando ao Redis...');

  const redis = new Redis({
    host: 'oregon-keyvalue.render.com',
    port: 6379,
    username: 'default', // O username padrão do Redis 6+ com ACL
    password: process.env.REDIS_PASSWORD,
    tls: {},
    lazyConnect: true
  });

  await redis.connect();
  logger.info('Redis conectado.');

  // 3️⃣ Criar auth state Redis
  const { state: redisState, saveCreds } = await redisAuthState(redis);

  // 4️⃣ Migrar dados
  logger.info('Copiando credenciais da sessão local para a sessão Redis...');
  redisState.creds = fileState.creds;
  redisState.keys = fileState.keys;

  await saveCreds();

  logger.info('🎉 Sessão migrada com sucesso para o Redis!');
  await redis.quit();
}

migrateSession().catch(err => {
  logger.error({ err }, 'Erro fatal na migração');
  process.exit(1);
});