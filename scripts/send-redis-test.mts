
import makeWASocket, {
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { redis } from '../src/redis.js';
import { useCustomRedisAuthState } from '../src/redis-auth-store.js';
import logger from '../src/logger.js';

// --- CONFIGURAÇÕES ---
const GROUP_ID = '120363404510855649@g.us';
const MESSAGE = 'Hello Gally - Test 3 (from Redis)';
const SEND_DELAY_SECONDS = 3;
// -------------------

async function sendRedisTestMessage() {
  logger.info('[REDIS-TEST] Iniciando teste de envio com sessão do Redis...');

  try {
    const { state, saveCreds } = await useCustomRedisAuthState(redis);
    
    if (!state.creds.registered) {
      logger.error('[REDIS-TEST] Nenhuma sessão registrada encontrada no Redis. Abortando.');
      return;
    }

    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      logger.info(`[REDIS-TEST] Status da conexão: ${connection}`);

      if (connection === 'open') {
        logger.info('[REDIS-TEST] ✅ Conectado com sucesso! Enviando mensagem...');
        
        try {
          await sock.sendMessage(GROUP_ID, { text: MESSAGE });
          logger.info(`[REDIS-TEST] ✅ Mensagem de teste enviada para o grupo ${GROUP_ID}`);
          
          logger.info(`[REDIS-TEST] Aguardando ${SEND_DELAY_SECONDS} segundos...`);
          await new Promise(resolve => setTimeout(resolve, SEND_DELAY_SECONDS * 1000));

        } catch (err) {
          logger.error({ err }, '[REDIS-TEST] ❌ Falha ao enviar a mensagem.');
        } finally {
          logger.info('[REDIS-TEST] Encerrando socket...');
          sock.end();
        }
      } else if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          logger.error('[REDIS-TEST] ❌ Conexão encerrada permanentemente (logout). A sessão no Redis é inválida.');
        } else {
          logger.info(`[REDIS-TEST] Conexão encerrada. Status: ${statusCode || 'desconhecido'}`);
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, '[REDIS-TEST] ❌ Erro inesperado durante a execução.');
  } finally {
    // Adicionado um delay para garantir que o socket.end() complete antes de fechar o redis
    setTimeout(async () => {
      await redis.quit();
      logger.info('[REDIS-TEST] Conexão com o Redis encerrada.');
    }, SEND_DELAY_SECONDS * 1000 + 2000); // Garante que o redis feche depois do socket
  }
}

sendRedisTestMessage();
