
import makeWASocket, {
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { redis } from '../src/redis.js';
import { useCustomRedisAuthState } from '../src/redis-auth-store.js';
import logger from '../src/logger.js';

// --- CONFIGURAÇÕES ---
const GROUP_ID = '120363404510855649@g.us';
const MESSAGE = 'Hello Gally! Conexão persistente estabelecida com sucesso via Redis!';
const TEST_DURATION_SECONDS = 60;
const RECONNECT_DELAY_SECONDS = 15;
// -------------------

let sock: WASocket | undefined;
let mainTimeout: NodeJS.Timeout | undefined;

const cleanup = async (exitCode = 0) => {
  logger.info(`[PERSISTENT-TEST] Encerrando o teste com código ${exitCode}.`);
  if (mainTimeout) clearTimeout(mainTimeout);
  // Garantir que não tentemos usar um socket antigo
  if (sock) {
    sock.ev.removeAllListeners();
    sock.end(undefined);
  }
  await redis.quit();
  logger.info('[PERSISTENT-TEST] Conexão com o Redis encerrada.');
  process.exit(exitCode);
};

async function connectToWhatsApp() {
  logger.info('[PERSISTENT-TEST] Tentando conectar ao WhatsApp...');
  
  const { state, saveCreds } = await useCustomRedisAuthState(redis);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    logger.info(`[PERSISTENT-TEST] Status da conexão: ${connection}`);

    if (connection === 'open') {
      logger.info('[PERSISTENT-TEST] ✅ Conectado com sucesso! Enviando mensagem...');
      try {
        const result = await sock?.sendMessage(GROUP_ID, { text: MESSAGE });
        logger.info({ msgId: result?.key.id }, `[PERSISTENT-TEST] ✅ Mensagem de teste enviada para o grupo ${GROUP_ID}`);
        
        logger.info('[PERSISTENT-TEST] Aguardando 5 segundos...');
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (err) {
        logger.error({ err }, '[PERSISTENT-TEST] ❌ Falha ao enviar a mensagem.');
      } finally {
        await cleanup(0); // Sucesso, encerrar tudo
      }
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      logger.warn(`[PERSISTENT-TEST] Conexão encerrada. Status: ${statusCode || 'desconhecido'}`);

      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('[PERSISTENT-TEST] ❌ Logout. A sessão é inválida. Encerrando permanentemente.');
        await cleanup(1);
      } else {
        logger.info(`[PERSISTENT-TEST] Agendando nova tentativa de conexão em ${RECONNECT_DELAY_SECONDS} segundos...`);
        setTimeout(connectToWhatsApp, RECONNECT_DELAY_SECONDS * 1000);
      }
    }
  });
}

async function runPersistentTest() {
  logger.info(`[PERSISTENT-TEST] Iniciando teste de conexão persistente por ${TEST_DURATION_SECONDS} segundos.`);
  
  mainTimeout = setTimeout(async () => {
    logger.warn(`[PERSISTENT-TEST] ⏰ Teste encerrado por timeout de ${TEST_DURATION_SECONDS} segundos.`);
    await cleanup(1); // Encerrar com erro se o tempo acabar
  }, TEST_DURATION_SECONDS * 1000);

  process.on('exit', () => logger.info('[PERSISTENT-TEST] Processo finalizado.'));
  
  const { state } = await useCustomRedisAuthState(redis);
  if (!state.creds.registered) {
    logger.error('[PERSISTENT-TEST] Nenhuma sessão registrada encontrada no Redis. Abortando.');
    await cleanup(1);
    return;
  }

  connectToWhatsApp();
}

runPersistentTest();
