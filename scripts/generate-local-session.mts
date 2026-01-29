import 'dotenv/config';
import makeWASocket, {
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
  useMultiFileAuthState, // A forma mais simples de salvar a sessão em arquivos locais
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { exit } from 'process';

const logger = pino({ level: 'info' });

/**
 * ESTE SCRIPT GERA UMA SESSÃO LOCAL DO WHATSAPP.
 * Ele não usa Redis. Ele salva a sessão em uma nova pasta chamada 'baileys_auth_local'.
 */
async function generateLocalSession() {
  const phoneNumber = process.env.PAIRING_PHONE_NUMBER;
  if (!phoneNumber) {
    logger.fatal('A variável de ambiente PAIRING_PHONE_NUMBER não está definida.');
    throw new Error('PAIRING_PHONE_NUMBER is not set.');
  }

  logger.info('================================================');
  logger.info('Iniciando Gerador de Sessão LOCAL');
  logger.info('Esta sessão será salva na pasta "baileys_auth_local"');
  logger.info('================================================');

  // useMultiFileAuthState salva a sessão em arquivos JSON locais
  const { state, saveCreds } = await useMultiFileAuthState('session');

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: Browsers.ubuntu('Chrome'),
  });

  // Salva as credenciais sempre que forem atualizadas
  sock.ev.on('creds.update', saveCreds);

  // Lida com os eventos de conexão
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      logger.info('🎉 Conexão aberta com sucesso! A sessão foi salva localmente.');
      logger.info('Você já pode fechar este script (Ctrl+C).');
    } else if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      logger.error(`Conexão fechada. Razão: ${statusCode}`);
      logger.info('O script será encerrado.');
      exit(1);
    }
  });

  logger.info(`Solicitando código de pareamento para o número: ${phoneNumber}`);
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
    exit(1);
  }
}

generateLocalSession().catch((err) => {
  logger.fatal({ err }, 'Ocorreu um erro fatal no script.');
  process.exit(1);
});
