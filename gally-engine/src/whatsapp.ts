import { promises as fs } from 'fs';
import path from 'path';
import makeWASocket, {
  fetchLatestBaileysVersion,
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  Browsers,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { config } from './config.js';
import logger from './logger.js';

import { updateWaSessionOnRender } from './render-api.js';

const TEMP_SESSION_DIR = './temp_session';
const CREDS_FILE_PATH = path.join(TEMP_SESSION_DIR, 'creds.json');
let sock: WASocket | undefined;
let credsUpdateDebounceTimeout: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 5 * 60 * 1000; // 5 minutos

// --- State Machine ---
export type WAConnectionState = 'CONNECTING' | 'OPEN' | 'CLOSED' | 'ERROR';
let currentState: WAConnectionState = 'CLOSED';

/**
 * Returns the current state of the WhatsApp connection.
 */
export function getWAConnectionState(): WAConnectionState {
  return currentState;
}
// ---------------------

/**
 * Hidrata a sessão a partir da variável de ambiente (Base64) para um arquivo local.
 */
async function hydrateSession() {
  logger.info(`[HYDRATE] Hidratando a sessão completa na pasta temporária: ${TEMP_SESSION_DIR}`);
  try {
    // Limpa o diretório da sessão temporária
    await fs.rm(TEMP_SESSION_DIR, { recursive: true, force: true }).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
    await fs.mkdir(TEMP_SESSION_DIR, { recursive: true });

    const sessionBundleString = config.waSession;
    if (!sessionBundleString) {
        throw new Error('A variável de ambiente WA_SESSION_BASE64 está vazia.');
    }

    logger.info(`[HYDRATE] String da sessão recebida com comprimento: ${sessionBundleString.length}`);

    // Decodifica a string Base64 para a string JSON do bundle
    const decodedBundle = Buffer.from(sessionBundleString, 'base64').toString('utf-8');
    
    // Parseia a string JSON para o objeto que contém os arquivos da sessão
    const sessionFiles = JSON.parse(decodedBundle);

    const fileNames = Object.keys(sessionFiles);
    if (fileNames.length === 0) {
        throw new Error('O bundle da sessão está vazio ou em formato inválido.');
    }

    logger.info(`[HYDRATE] Desempacotando ${fileNames.length} arquivos da sessão: [${fileNames.join(', ')}]`);

    // Itera sobre cada arquivo no bundle e o escreve no disco
    for (const fileName of fileNames) {
      const fileContent = sessionFiles[fileName];
      const filePath = path.join(TEMP_SESSION_DIR, fileName);
      // O conteúdo já é um objeto JSON, então o stringify para salvar
      await fs.writeFile(filePath, JSON.stringify(fileContent, null, 2));
      logger.debug(`  - Arquivo '${fileName}' hidratado com sucesso.`);
    }

    logger.info('[HYDRATE] Sessão completa hidratada com sucesso.');
  } catch (error) {
    logger.error({ error }, '[HYDRATE] Falha ao hidratar a sessão completa. Verifique se a WA_SESSION_BASE64 está no formato de bundle correto.');
    throw error;
  }
}

/**
 * Conecta ao WhatsApp usando a sessão hidratada.
 */
async function connectToWhatsApp() {
  logger.info('[WAPP] Iniciando tentativa de conexão com o WhatsApp...');
  currentState = 'CONNECTING';

  const { state, saveCreds } = await useMultiFileAuthState(TEMP_SESSION_DIR);

  // Função debounced para salvar e persistir as credenciais
  const debouncedCredsUpdate = () => {
    if (credsUpdateDebounceTimeout) {
      clearTimeout(credsUpdateDebounceTimeout);
    }
    credsUpdateDebounceTimeout = setTimeout(async () => {
      try {
        logger.info('[WAPP] Debounced creds.update: Salvando e persistindo sessão...');
        await saveCreds();
        const updatedCreds = await fs.readFile(CREDS_FILE_PATH, 'utf-8');
        const sessionBase64 = Buffer.from(updatedCreds).toString('base64');
        await updateWaSessionOnRender(sessionBase64);
        logger.info('[WAPP] Sessão salva e persistida na nuvem com sucesso.');
      } catch (error) {
        logger.error({ error }, '[WAPP] Falha no processo debounced de creds.update.');
      }
    }, 3000); // Aguarda 3 segundos após o último evento
  };

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'debug' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
  });

  sock.ev.on('creds.update', debouncedCredsUpdate);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection) {
      const newState = connection.toUpperCase() as WAConnectionState;
      if (currentState !== newState) {
        currentState = newState;
        logger.info(`[WAPP] Status da conexão alterado para: ${currentState}`);
      }
    } else {
      logger.info(`[WAPP] Recebido evento de conexão intermediário (sem status definido).`);
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      logger.warn(`🔌 Conexão fechada. Razão: ${statusCode}`);
      
      if (statusCode !== DisconnectReason.loggedOut) {
        reconnectAttempts++;
        const delay = Math.min(Math.pow(2, reconnectAttempts) * 5000, MAX_RECONNECT_DELAY);
        logger.info(`Tentando reconectar em ${delay / 1000} segundos... (Tentativa ${reconnectAttempts})`);
        setTimeout(connectToWhatsApp, delay);
      } else {
        currentState = 'ERROR';
        logger.error('❌ SESSÃO DESLOGADA. É necessário gerar uma nova sessão e atualizar a variável de ambiente.');
      }
    } else if (connection === 'open') {
      reconnectAttempts = 0; // Reseta as tentativas ao conectar com sucesso
      currentState = 'OPEN';
      logger.info('✅ Conexão com o WhatsApp estabelecida!');
    }
  });
}

/**
 * Inicializa todo o serviço de WhatsApp.
 */
export async function initWhatsApp() {
  await hydrateSession();
  await connectToWhatsApp();
}

/**
 * Encerra a conexão com o WhatsApp de forma limpa.
 */
export async function closeWhatsApp() {
    if (sock) {
        logger.info('[WAPP] Encerrando a conexão com o WhatsApp...');
        await sock.logout();
        logger.info('[WAPP] Conexão com o WhatsApp encerrada.');
    }
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
            const messageCaption = isFirstImage ? caption : undefined;

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