
import fs from 'fs';
import makeWASocket,
{
  useMultiFileAuthState,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import axios from 'axios';
import { exit } from 'process';

const logger = pino({ level: 'info' });

const GROUP_ID = '120363404510855649@g.us';
const SOURCE_SESSION_FILE = 'whatsapp-session.json'; // A sessão que falha na Render
const CAPTURE_DIR = './warmed_session'; // Onde a sessão aquecida será salva

/**
 * Este script usa a sessão "fria" para conectar, envia uma mensagem,
 * e o mais importante, SALVA a sessão "aquecida" resultante na pasta 'warmed_session'.
 */
async function captureWarmedUpSession() {
  logger.info(`Lendo a sessão original de: ${SOURCE_SESSION_FILE}`);
  if (!fs.existsSync(SOURCE_SESSION_FILE)) {
    logger.error(`Arquivo de sessão de origem não encontrado: ${SOURCE_SESSION_FILE}. Execute o passo anterior para criá-lo.`);
    exit(1);
  }

  // Prepara o diretório de captura
  if (fs.existsSync(CAPTURE_DIR)) {
    logger.warn(`Diretório de captura '${CAPTURE_DIR}' já existe. Removendo para garantir uma captura limpa.`);
    fs.rmSync(CAPTURE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(CAPTURE_DIR);
  fs.copyFileSync(SOURCE_SESSION_FILE, `${CAPTURE_DIR}/creds.json`);
  logger.info(`Sessão copiada para o diretório de captura: ${CAPTURE_DIR}`);

  const { state, saveCreds } = await useMultiFileAuthState(CAPTURE_DIR);

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    auth: state,
  });

  // A função saveCreds irá automaticamente salvar as atualizações em CAPTURE_DIR/creds.json
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      logger.info('✅ Conexão estabelecida. Enviando mensagem de teste para aquecer...');
      try {
        await sock.sendMessage(GROUP_ID, {
          text: `Gallyfans Engine 🤖\nSessão AQUECIDA e CAPTURADA com sucesso em: ${new Date().toLocaleString('pt-BR')}`,
        });
        logger.info('🎉 Mensagem de aquecimento enviada!');
        
        logger.info('Aguardando 5 segundos para garantir que a sessão seja salva...');
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (err) {
        logger.error({ err }, 'Falha ao enviar a mensagem de aquecimento.');
      } finally {
        logger.info('Missão de captura cumprida. A sessão aquecida está em "warmed_session/creds.json". Encerrando.');
        sock.end(undefined);
        exit(0);
      }
    } else if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      logger.error(`🔌 Conexão fechada. Razão: ${statusCode} (${DisconnectReason[statusCode as number] || 'Desconhecida'})`);
      if (statusCode === DisconnectReason.loggedOut) {
        logger.fatal('‼️ A SESSÃO FOI DESLOGADA. O arquivo "whatsapp-session.json" é inválido.');
      }
      exit(1);
    }
  });
}

captureWarmedUpSession().catch((err) => {
  logger.fatal({ err }, 'Ocorreu um erro fatal no script de captura.');
  process.exit(1);
});
