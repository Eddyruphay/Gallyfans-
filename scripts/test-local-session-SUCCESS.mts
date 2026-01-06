import fs from 'fs';
import makeWASocket, {
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
const AUTH_SESSION_FILE = 'whatsapp-session.json';
const TEMP_AUTH_DIR = './auth_info_temp_send';

async function sendCuratedImage() {
  // --- 1. Usar um URL de imagem de teste ---
  const imageUrl = 'https://picsum.photos/800/600';
  logger.info(`Usando imagem de teste: ${imageUrl}`);

  // --- 2. Baixar a imagem ---
  logger.info('Baixando a imagem...');
  let imageBuffer: Buffer;
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    imageBuffer = Buffer.from(response.data);
    logger.info('Download da imagem concluído.');
  } catch (error) {
    logger.error({ error }, 'Falha ao baixar a imagem.');
    exit(1);
  }

  // --- 3. Conectar ao WhatsApp usando a sessão local ---
  logger.info(`Lendo a sessão do arquivo: ${AUTH_SESSION_FILE}`);
  if (!fs.existsSync(AUTH_SESSION_FILE)) {
    logger.error(`Arquivo de sessão não encontrado: ${AUTH_SESSION_FILE}.`);
    exit(1);
  }

  if (fs.existsSync(TEMP_AUTH_DIR)) {
    fs.rmSync(TEMP_AUTH_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_AUTH_DIR);
  fs.copyFileSync(AUTH_SESSION_FILE, `${TEMP_AUTH_DIR}/creds.json`);

  const { state, saveCreds } = await useMultiFileAuthState(TEMP_AUTH_DIR);

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    auth: state,
  });

  sock.ev.on('creds.update', saveCreds);

  // --- 4. Enviar a imagem ---
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      logger.info('Conexão estabelecida. Enviando imagem para o grupo...');
      try {
        const result = await sock.sendMessage(GROUP_ID, {
          image: imageBuffer,
          caption: 'Gallyfans Curadoria ✨ (Teste com atraso)',
        });
        logger.info({ msgId: result.key.id }, '🎉 Imagem enviada com sucesso para o grupo!');
        
        logger.info('Aguardando 5 segundos antes de encerrar...');
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (err) {
        logger.error({ err }, 'Falha ao enviar a imagem.');
      } finally {
        logger.info('Missão cumprida. Encerrando conexão.');
        fs.rmSync(TEMP_AUTH_DIR, { recursive: true, force: true });
        sock.end(undefined);
      }
    } else if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        logger.error(`Conexão fechada inesperadamente. Status: ${statusCode}`);
      } else {
        logger.warn('Conexão fechada (logout). A sessão pode ser inválida.');
      }
      fs.rmSync(TEMP_AUTH_DIR, { recursive: true, force: true });
    }
  });
}

sendCuratedImage().catch((err) => {
  logger.fatal({ err }, 'Ocorreu um erro fatal no script.');
  process.exit(1);
});
