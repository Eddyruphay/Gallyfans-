import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { useCustomRedisAuthState } from '../src/redis-auth-store.js';
import { Redis } from 'ioredis';
import pino from 'pino';
import 'dotenv/config';

const logger = pino({ level: 'info' });

async function migrateSession() {
  logger.info('Iniciando migração de sessão de arquivos para Redis...');

  const { REDIS_URL } = process.env;

  if (!REDIS_URL) {
    logger.fatal('REDIS_URL não definida. Abortando.');
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

  // 2️⃣ Conectar Redis
  logger.info('Conectando ao Redis...');
  const redis = new Redis(REDIS_URL, { tls: {} });
  logger.info('Redis conectado.');

  // 3️⃣ Usar o mesmo auth store da aplicação
  const { state: redisState, saveCreds: saveRemoteCreds } = await useCustomRedisAuthState(redis);

  // 4️⃣ Migrar dados
  logger.info('Copiando credenciais e chaves da sessão local para a sessão Redis...');
  redisState.creds = fileState.creds;
  // O objeto `keys` do useMultiFileAuthState é complexo, mas o nosso useCustomRedisAuthState
  // espera um objeto simples. A forma mais segura é pegar o objeto `keys` inteiro.
  redisState.keys = fileState.keys;

  await saveRemoteCreds();

  logger.info('🎉 Sessão migrada com sucesso para o Redis!');
  await redis.quit();
}

migrateSession().catch(err => {
  logger.error({ err }, 'Erro fatal na migração');
  process.exit(1);
});
