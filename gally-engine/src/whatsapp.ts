import { promises as fs } from 'fs';
import path from 'path';
import makeWASocket, {
  fetchLatestBaileysVersion,
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { config } from './config.js';
import logger from './logger.js';

import { updateWaSessionOnRender } from './render-api.js';

const TEMP_SESSION_DIR = './temp_session';
const CREDS_FILE_PATH = path.join(TEMP_SESSION_DIR, 'creds.json');
let sock: WASocket | undefined;
let debounceTimeout: NodeJS.Timeout | null = null;

/**
 * Hidrata a sessão a partir da variável de ambiente (Base64) para um arquivo local.
 */
async function hydrateSession() {
  if (!config.waSession) {
    logger.warn('[HYDRATE] WA_SESSION_BASE64 não definida. O bot tentará parear se não houver sessão local.');
    return;
  }

  logger.info(`[HYDRATE] Hidratando a sessão na pasta temporária: ${TEMP_SESSION_DIR}`);
  try {
    await fs.rm(TEMP_SESSION_DIR, { recursive: true, force: true });
    await fs.mkdir(TEMP_SESSION_DIR, { recursive: true });

    const sessionJson = Buffer.from(config.waSession, 'base64').toString('utf-8');
    await fs.writeFile(CREDS_FILE_PATH, sessionJson);
    logger.info('[HYDRATE] Sessão hidratada com sucesso.');
  } catch (error: any) {
    if (error.code !== 'ENOENT') { // Ignora erro se a pasta não existir na primeira vez
      logger.error({ error }, '[HYDRATE] Falha ao hidratar a sessão. O serviço não poderá iniciar corretamente.');
      throw error; // Lança o erro para impedir a inicialização
    }
  }
}

/**
 * Com debounce e de forma assíncrona, lê as credenciais salvas e atualiza a variável de ambiente no Render.
 */
function handleCredsUpdate() {
    if (debounceTimeout) {
        clearTimeout(debounceTimeout);
    }

    debounceTimeout = setTimeout(async () => {
        try {
            logger.info('[WAPP] Debounced creds.update: Iniciando a persistência da sessão na nuvem...');
            
            // Leitura assíncrona e não-bloqueante
            const updatedCreds = await fs.readFile(CREDS_FILE_PATH, 'utf-8');
            const sessionBase64 = Buffer.from(updatedCreds).toString('base64');
            
            await updateWaSessionOnRender(sessionBase64);

            logger.info('[WAPP] Persistência da sessão na nuvem concluída com sucesso.');
        } catch (error) {
            logger.error({ error }, '[WAPP] Falha crítica no processo de persistência da sessão na nuvem.');
        }
    }, 5000); // Debounce de 5 segundos para agrupar várias atualizações rápidas
}


/**
 * Conecta ao WhatsApp usando a sessão hidratada.
 */
async function connectToWhatsApp() {
  logger.info('[WAPP] Conectando ao WhatsApp...');

  const { state, saveCreds } = await useMultiFileAuthState(TEMP_SESSION_DIR);

  sock = makeWASocket({
    version: (await fetchLatestBaileysVersion()).version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false, // Nunca imprimir QR em produção
    browser: ['Gallyfans', 'Produção', '1.0'],
  });

  // O saveCreds é síncrono, então podemos chamar o handleCredsUpdate logo em seguida.
  sock.ev.on('creds.update', () => {
    saveCreds();
    handleCredsUpdate();
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    logger.info(`[WAPP] Status da conexão: ${connection}`);

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      logger.warn(`🔌 Conexão fechada. Razão: ${statusCode}`);
      
      if (statusCode !== DisconnectReason.loggedOut) {
        logger.info('Tentando reconectar em 15 segundos...');
        setTimeout(connectToWhatsApp, 15000);
      } else {
        logger.error('❌ SESSÃO DESLOGADA. É necessário gerar uma nova sessão e atualizar a variável de ambiente.');
        // O serviço irá parar de tentar reconectar.
      }
    } else if (connection === 'open') {
      logger.info('✅ Conexão com o WhatsApp estabelecida!');
    }
  });
}

/**
 * Inicializa todo o serviço de WhatsApp.
 */
export async function initWhatsApp() {
  hydrateSession();
  await connectToWhatsApp();
}

/**
 * Envia um álbum de imagens para um JID específico.
 * A primeira imagem recebe a legenda, as outras um espaço.
 * @param jid O JID do destinatário.
 * @param caption A legenda para a primeira imagem.
 * @param images Um array de URLs de imagem.
 */
export async function sendAlbum(jid: string, caption: string = '', images: string[]) {
    logger.info({ jid, imageCount: images.length }, 'Iniciando envio de álbum...');

    if (!sock || !sock.user) {
        logger.error('[WAPP] Tentativa de envio de álbum com o WhatsApp não conectado ou não autenticado.');
        throw new Error('WhatsApp não está conectado ou autenticado.');
    }

    try {
        for (let i = 0; i < images.length; i++) {
            const imageUrl = images[i];
            const isFirstImage = i === 0;
            const messageCaption = isFirstImage ? caption : ' ';

            logger.info(`Enviando imagem ${i + 1}/${images.length} para ${jid}`);
            
            await sock.sendMessage(jid, {
                image: { url: imageUrl },
                caption: messageCaption,
            });

            logger.info(`Imagem ${i + 1} enviada.`);

            // Adiciona um delay entre as imagens para evitar bloqueio e garantir a ordem
            if (i < images.length - 1) {
                await new Promise(resolve => setTimeout(resolve, config.delayBetweenMessages));
            }
        }
        logger.info({ jid }, 'Envio de álbum concluído com sucesso.');
    } catch (error) {
        logger.error({ err: error, jid }, 'Erro durante o envio do álbum.');
        // Lança o erro para que o chamador (se houver) possa tratá-lo.
        throw error;
    }
}

/**
 * Envia uma mensagem de texto simples.
 * @param jid O JID do destinatário.
 * @param text O texto a ser enviado.
 */
export async function sendTextMessage(jid: string, text: string) {
    logger.info({ jid }, 'Iniciando envio de mensagem de texto...');

    if (!sock || !sock.user) {
        logger.error('[WAPP] Tentativa de envio de texto com o WhatsApp não conectado ou não autenticado.');
        throw new Error('WhatsApp não está conectado ou autenticado.');
    }

    try {
        await sock.sendMessage(jid, { text });
        logger.info({ jid }, 'Mensagem de texto enviada com sucesso.');
    } catch (error) {
        logger.error({ err: error, jid }, 'Erro durante o envio da mensagem de texto.');
        throw error;
    }
}