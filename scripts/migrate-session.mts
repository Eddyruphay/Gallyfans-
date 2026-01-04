import 'dotenv/config';
import { redis } from '../src/redis.js';
import { useCustomRedisAuthState } from '../src/redis-auth-store.js';
import logger from '../src/logger.js';
import { promises as fs } from 'fs';
import path from 'path';

const LOCAL_AUTH_DIR = 'baileys_auth_local';

/**
 * This script migrates a local Baileys session (folder) to Redis.
 */
async function migrateSession() {
  logger.info('================================================');
  logger.info('Iniciando Migração de Sessão Local para Redis');
  logger.info(`Lendo credenciais da pasta: ${LOCAL_AUTH_DIR}`);
  logger.info('================================================');

  try {
    // 1. Verificar se a pasta de autenticação local existe
    await fs.access(LOCAL_AUTH_DIR);

    // 2. Conectar ao Redis e preparar o hook de autenticação
    const { state: redisState, saveCreds: saveCredsToRedis } = await useCustomRedisAuthState(redis);

    if (redisState.creds.registered) {
      logger.warn('Uma sessão já existe no Redis. A migração irá sobrescrevê-la.');
      logger.warn('Pressione Ctrl+C em 5 segundos para cancelar...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // 3. Ler as credenciais da pasta local
    // O useMultiFileAuthState armazena tudo em um único objeto `creds`
    // que é salvo em `creds.json`.
    const credsFilePath = path.join(LOCAL_AUTH_DIR, 'creds.json');
    const localCredsRaw = await fs.readFile(credsFilePath, { encoding: 'utf-8' });
    const localCreds = JSON.parse(localCredsRaw);

    // 4. Salvar as credenciais no Redis
    logger.info('Credenciais locais lidas com sucesso. Salvando no Redis...');
    await saveCredsToRedis(localCreds);

    logger.info('🎉 Migração concluída com sucesso!');
    logger.info('A sessão local foi copiada para o Redis.');

  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.fatal(`A pasta de autenticação local '${LOCAL_AUTH_DIR}' não foi encontrada.`);
      logger.fatal('Gere uma sessão local primeiro com "generate-local-session.mts".');
    } else {
      logger.fatal({ err: error }, 'Ocorreu um erro durante a migração.');
    }
  } finally {
    await redis.quit();
    logger.info('Conexão com o Redis fechada.');
  }
}

migrateSession().catch(err => {
  logger.fatal({ err }, 'Ocorreu um erro fatal no script de migração.');
  process.exit(1);
});