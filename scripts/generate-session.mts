import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { exit } from 'process';

const SESSION_FOLDER = './gallyfans_session';
const logger = pino({ level: 'info' });

/**
 * Este script gera e valida uma sessão local permanente na pasta 'gallyfans_session'.
 * 1. Se a sessão não existir, ele pede um código de pareamento.
 * 2. Se a sessão já existir, ele conecta para validar e depois fecha.
 */
async function generateOrValidateSession() {
  const phoneNumber = process.argv[2];
  if (!phoneNumber) {
    logger.error('Erro: Forneça o seu número de telefone como argumento.');
    logger.info('Uso: npx tsx scripts/generate-session.mts <seu_numero_de_telefone>');
    exit(1);
  }

  logger.info(`Usando a pasta de sessão: "${SESSION_FOLDER}"`);
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

  const sock = makeWASocket({
    version: (await fetchLatestBaileysVersion()).version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Gallyfans', 'Gerador de Sessão', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      logger.info('✅ Conexão estabelecida com sucesso.');
      logger.info(`📱 Usuário: ${sock.user?.id.split(':')[0]}`);
      logger.info('Sessão validada e salva. Encerrando.');
      sock.end(undefined);
      exit(0);
    } else if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      logger.warn(`Conexão fechada. Razão: ${statusCode}`);

      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('❌ A sessão foi deslogada. Apague a pasta "gallyfans_session" e tente novamente.');
      } else {
        logger.error('Falha ao conectar. Verifique sua conexão ou a sessão.');
      }
      exit(1);
    }
  });

  // Se após um tempo não conectar, verificamos se precisamos de um código.
  // Este timeout é para dar tempo ao 'connection.update' de disparar primeiro.
  setTimeout(async () => {
    if (sock.ws.readyState !== sock.ws.OPEN && !sock.authState.creds.registered) {
      logger.info('Sessão não registrada. Solicitando código de pareamento...');
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('================================================');
        console.log(`   Seu código de pareamento é: ${code}   `);
        console.log('================================================');
      } catch (error) {
        logger.error({ error }, 'Falha ao solicitar o código de pareamento.');
        exit(1);
      }
    } else if (sock.ws.readyState !== sock.ws.OPEN) {
        logger.warn('Não foi possível conectar. A sessão pode estar inválida.');
    }
  }, 10000); // Aguarda 10 segundos
}

generateOrValidateSession().catch((err) => {
  logger.fatal({ err }, 'Ocorreu um erro fatal no script.');
  process.exit(1);
});