import 'dotenv/config';
import makeWASocket, {
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
  makeInMemoryStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { redis } from '../src/redis.js';
import { useCustomRedisAuthState } from '../src/redis-auth-store.js';
import logger from '../src/logger.js';
import { exit } from 'process';

/**
 * This script is a dedicated tool for generating a WhatsApp session via pairing code.
 * It connects, requests the code, prints it, and waits for the connection to open,
 * then saves the credentials to Redis and exits.
 */
async function generateSession() {
  const phoneNumber = process.env.PAIRING_PHONE_NUMBER;
  if (!phoneNumber) {
    logger.fatal('A variável de ambiente PAIRING_PHONE_NUMBER não está definida.');
    throw new Error('PAIRING_PHONE_NUMBER is not set.');
  }

  logger.info(`Iniciando processo de pareamento para o número: ${phoneNumber}`);

  const { state, saveCreds } = await useCustomRedisAuthState(redis);

  // Se já estiver registrado, não faz sentido gerar uma nova sessão.
  // O usuário deve limpar a sessão antiga primeiro se quiser forçar.
  if (state.creds.registered) {
    logger.warn('Uma sessão já existe no Redis. Se você precisa de uma nova,');
    logger.warn('execute o script "clear-redis-session.mts" primeiro.');
    await redis.quit();
    return;
  }

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // QR code is not used for pairing
    logger,
    browser: Browsers.macOS('Desktop'),
  });

  // Listener para salvar credenciais quando atualizadas
  sock.ev.on('creds.update', saveCreds);

  // Listener para o status da conexão
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      logger.info('🎉 Conexão aberta com sucesso! A sessão foi salva no Redis.');
      logger.info('Você já pode fechar este script (Ctrl+C).');
      // A sessão já foi salva pelo 'creds.update', então podemos apenas aguardar.
    } else if (connection === 'close') {
      const error = new Boom(lastDisconnect?.error)?.output;
      logger.error(`Conexão fechada. Razão: ${error?.statusCode}`);
      if (error?.statusCode !== DisconnectReason.loggedOut) {
        logger.info('Tentando reconectar...');
        // A biblioteca tentará reconectar automaticamente sob certas condições
      } else {
        logger.fatal('Logout forçado. A sessão foi invalidada no WhatsApp.');
      }
      logger.info('O script será encerrado.');
      await redis.quit();
      exit(1); // Encerra o processo em caso de falha na conexão
    }
  });

  logger.info('Solicitando código de pareamento...');
  try {
    const code = await sock.requestPairingCode(phoneNumber);
    console.log('================================================');
    console.log('                                                ');
    console.log(`   Seu código de pareamento é: ${code}   `);
    console.log('                                                ');
    console.log('   Abra o WhatsApp no seu celular, vá em        ');
    console.log('   "Aparelhos conectados" -> "Conectar um aparelho"');
    console.log('   e selecione "Conectar com número de telefone". ');
    console.log('                                                ');
    console.log('================================================');
  } catch (error) {
    logger.error({ error }, 'Falha ao solicitar o código de pareamento.');
    await redis.quit();
    exit(1);
  }
}

generateSession().catch(async (err) => {
  logger.fatal({ err }, 'Ocorreu um erro fatal no script de geração de sessão.');
  await redis.quit();
  process.exit(1);
});
