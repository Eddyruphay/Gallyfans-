import fs from 'fs';
import path from 'path';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { exit } from 'process';

const logger = pino({ level: 'info' });
const TEMP_SESSION_DIR = './temp_hydrated_session';
const GROUP_ID = '120363404510855649@g.us';

/**
 * Hidrata uma sessão a partir de uma string Base64, conecta e envia uma mensagem.
 * @param sessionBase64 A string da sessão codificada em Base64.
 */
async function runHydratedSession(sessionBase64: string) {
  if (!sessionBase64) {
    logger.error('Erro: A string da sessão em Base64 não foi fornecida.');
    exit(1);
  }

  // --- 1. Hidratar a sessão ---
  logger.info(`Hidratando a sessão na pasta temporária: ${TEMP_SESSION_DIR}`);
  try {
    // Limpa a pasta antiga, se existir
    if (fs.existsSync(TEMP_SESSION_DIR)) {
      fs.rmSync(TEMP_SESSION_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_SESSION_DIR, { recursive: true });

    const sessionJson = Buffer.from(sessionBase64, 'base64').toString('utf-8');
    fs.writeFileSync(path.join(TEMP_SESSION_DIR, 'creds.json'), sessionJson);
    logger.info('Sessão hidratada com sucesso.');
  } catch (error) {
    logger.error({ error }, 'Falha ao hidratar a sessão a partir da string Base64.');
    exit(1);
  }

  // --- 2. Conectar usando a sessão hidratada ---
  const { state, saveCreds } = await useMultiFileAuthState(TEMP_SESSION_DIR);
  const sock = makeWASocket({
    version: (await fetchLatestBaileysVersion()).version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Gallyfans', 'Produção', '3.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      logger.info('✅ Conexão estabelecida com a sessão hidratada.');
      logger.info('Enviando mensagem de confirmação final...');
      try {
        const result = await sock.sendMessage(GROUP_ID, {
          text: 'Sistema Gallyfans online. Sessão hidratada com sucesso.',
        });
        logger.info({ msgId: result.key.id }, '🎉 Mensagem final enviada com sucesso!');
        
        logger.info('Aguardando 5 segundos...');
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (err) {
        logger.error({ err }, '❌ Falha ao enviar mensagem de confirmação.');
      } finally {
        logger.info('Teste da arquitetura final concluído com sucesso. Encerrando.');
        sock.end(undefined);
        fs.rmSync(TEMP_SESSION_DIR, { recursive: true, force: true }); // Limpa no final
        exit(0);
      }
    } else if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      logger.error(`Conexão fechada. Razão: ${statusCode}. A sessão pode ter sido invalidada.`);
      fs.rmSync(TEMP_SESSION_DIR, { recursive: true, force: true }); // Limpa em caso de erro
      exit(1);
    }
  });
}

// Pega a string da sessão do argumento da linha de comando
const sessionString = process.argv[2];
runHydratedSession(sessionString).catch((err) => {
  logger.fatal({ err }, 'Ocorreu um erro fatal no script de hidratação.');
  process.exit(1);
});
