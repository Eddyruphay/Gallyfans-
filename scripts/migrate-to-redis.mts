
import { Redis } from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../src/config.js';
import logger from '../src/logger.js';

// --- Funções de Serialização (copiadas de redis-auth-store.ts) ---
const replacer = (key: string, value: any) => {
  if (value instanceof Buffer) {
    return { type: 'Buffer', data: value.toJSON().data };
  }
  return value;
};

const reviver = (key: string, value: any) => {
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  return value;
};
// --------------------------------------------------------------------

const AUTH_FOLDER = 'baileys_auth_hello';
const KEY_PREFIX = 'baileys-auth:';
const credsKey = `${KEY_PREFIX}creds`;
const keysKey = `${KEY_PREFIX}keys`;

async function migrateSessionToRedis() {
  logger.info(`[MIGRATE] Iniciando migração da sessão da pasta '${AUTH_FOLDER}' para o Redis.`);

  const redis = new Redis(config.redisUrl, {
    tls: {}, // Necessário para o Redis do Render
    connectTimeout: 30000,
  });

  redis.on('error', err => logger.error({ err }, '[MIGRATE] Erro de conexão com o Redis'));

  try {
    // 1. Ler e migrar 'creds.json'
    const credsFilePath = path.join(AUTH_FOLDER, 'creds.json');
    const credsContent = await fs.readFile(credsFilePath, { encoding: 'utf-8' });
    // Não precisa de reviver aqui, pois estamos lendo o arquivo original
    const credsData = JSON.parse(credsContent);
    await redis.set(credsKey, JSON.stringify(credsData, replacer));
    logger.info(`[MIGRATE] ✅ 'creds' migrados com sucesso para a chave: ${credsKey}`);

    // 2. Ler e migrar todos os outros arquivos de chaves
    const keysObject: { [key: string]: any } = {};
    const files = await fs.readdir(AUTH_FOLDER);
    
    for (const file of files) {
      if (file !== 'creds.json' && file.endsWith('.json')) {
        const keyName = path.basename(file, '.json');
        const filePath = path.join(AUTH_FOLDER, file);
        const fileContent = await fs.readFile(filePath, { encoding: 'utf-8' });
        // Não precisa de reviver aqui
        keysObject[keyName] = JSON.parse(fileContent);
        logger.info(`[MIGRATE] -> Carregada a chave '${keyName}' do arquivo.`);
      }
    }

    if (Object.keys(keysObject).length > 0) {
      await redis.set(keysKey, JSON.stringify(keysObject, replacer));
      logger.info(`[MIGRATE] ✅ Todas as chaves (${Object.keys(keysObject).length}) migradas com sucesso para a chave: ${keysKey}`);
    } else {
      logger.warn('[MIGRATE] Nenhuma chave encontrada para migrar (além de creds). Isso é normal se a sessão for nova.');
    }

    logger.info('[MIGRATE] Migração concluída com sucesso!');

  } catch (error) {
    logger.error({ err: error }, '[MIGRATE] Falha catastrófica durante a migração.');
  } finally {
    await redis.quit();
    logger.info('[MIGRATE] Conexão com o Redis encerrada.');
  }
}

migrateSessionToRedis();
