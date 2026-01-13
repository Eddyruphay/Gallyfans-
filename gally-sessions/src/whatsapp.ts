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
let sock: WASocket | undefined;
let credsUpdateDebounceTimeout: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 5 * 60 * 1000; // 5 minutos

const ENV_PREFIX = 'WA_SESSION_';

// --- State Machine ---
export type WAConnectionState = 'CONNECTING' | 'OPEN' | 'CLOSED' | 'ERROR';
let currentState: WAConnectionState = 'CLOSED';

export function getWAConnectionState(): WAConnectionState {
  return currentState;
}
// ---------------------

/**
 * Converte um nome de variável de ambiente para um nome de arquivo.
 * Ex: 'WA_SESSION_CREDS_JSON' -> 'creds.json'
 */
function envVarToFileName(envVar: string): string {
  return envVar
    .replace(ENV_PREFIX, '')
    .replace(/_/g, '.')
    .toLowerCase();
}

/**
 * Converte um nome de arquivo para um nome de variável de ambiente.
 * Ex: 'creds.json' -> 'WA_SESSION_CREDS_JSON'
 */
function fileNameToEnvVar(fileName: string): string {
    return `${ENV_PREFIX}${fileName.replace(/\./g, '_').toUpperCase()}`;
}


/**
 * Hidrata a sessão completa a partir de múltiplas variáveis de ambiente.
 */
async function hydrateSession() {
  logger.info(`[HYDRATE] Iniciando hidratação da sessão multi-arquivo a partir das variáveis de ambiente...`);
  
  try {
    await fs.rm(TEMP_SESSION_DIR, { recursive: true, force: true }).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
    await fs.mkdir(TEMP_SESSION_DIR, { recursive: true });

    const sessionEnvVars = Object.keys(process.env)
      .filter(key => key.startsWith(ENV_PREFIX));

    if (sessionEnvVars.length === 0) {
      logger.warn(`[HYDRATE] Nenhuma variável de ambiente com o prefixo '${ENV_PREFIX}' encontrada. O Baileys tentará gerar uma nova sessão.`);
      return;
    }

    logger.info(`[HYDRATE] Encontradas ${sessionEnvVars.length} variáveis de sessão para hidratar.`);
    
    const hydratedFiles: string[] = [];

    for (const envVar of sessionEnvVars) {
      const sessionData = process.env[envVar];
      if (sessionData) {
        const fileName = envVarToFileName(envVar);
        const filePath = path.join(TEMP_SESSION_DIR, fileName);
        const fileContent = Buffer.from(sessionData, 'base64');
        
        await fs.writeFile(filePath, fileContent);
        hydratedFiles.push(fileName);
      }
    }

    logger.info(`[HYDRATE] ✅ Sessão multi-arquivo hidratada com sucesso. Arquivos recriados: [${hydratedFiles.join(', ')}]`);

  } catch (error) {
    logger.error({ error, msg: '[HYDRATE] Falha crítica ao hidratar a sessão multi-arquivo.' });
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

  const debouncedCredsUpdate = () => {
    if (credsUpdateDebounceTimeout) {
      clearTimeout(credsUpdateDebounceTimeout);
    }
    credsUpdateDebounceTimeout = setTimeout(async () => {
      try {
        logger.info('[WAPP] Debounced creds.update: Salvando e persistindo sessão multi-arquivo...');
        await saveCreds();

        const sessionFiles = await fs.readdir(TEMP_SESSION_DIR);
        const envVarsToUpdate = [];

        for (const fileName of sessionFiles) {
            const filePath = path.join(TEMP_SESSION_DIR, fileName);
            const fileContent = await fs.readFile(filePath);
            const base64Content = fileContent.toString('base64');
            const envVarKey = fileNameToEnvVar(fileName);
            envVarsToUpdate.push({ key: envVarKey, value: base64Content });
        }
        
        if (envVarsToUpdate.length > 0) {
            await updateWaSessionOnRender(envVarsToUpdate);
            logger.info(`[WAPP] Sessão multi-arquivo (${envVarsToUpdate.length} arquivos) salva e persistida na nuvem com sucesso.`);
        } else {
            logger.warn('[WAPP] Nenhum arquivo de sessão encontrado para persistir.');
        }

      } catch (error) {
        logger.error({ error, msg: '[WAPP] Falha no processo debounced de creds.update.' });
      }
    }, 3000);
  };

  sock = makeWASocket({
    auth: state,
    logger: pino_({ level: 'debug' }),
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
      reconnectAttempts = 0;
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
 */
export async function sendAlbum(jid: string, caption: string = '', imageUrls: string[]) {
    logger.info({ jid, imageCount: imageUrls.length }, 'Iniciando envio de álbum...');

    if (currentState !== 'OPEN' || !sock) {
        logger.error('[WAPP] Tentativa de envio de álbum com o WhatsApp não conectado.');
        throw new Error('WhatsApp não está conectado.');
    }

    try {
        // Envia a primeira imagem com a legenda
        await sock.sendMessage(jid, {
            image: { url: imageUrls[0] },
            caption: caption,
        });
        logger.info(`Imagem 1/${imageUrls.length} enviada com legenda.`);

        // Envia as imagens restantes sem legenda
        for (let i = 1; i < imageUrls.length; i++) {
            await new Promise(resolve => setTimeout(resolve, config.delayBetweenMessages));
            await sock.sendMessage(jid, {
                image: { url: imageUrls[i] },
            });
            logger.info(`Imagem ${i + 1}/${imageUrls.length} enviada.`);
        }
        
        logger.info({ jid }, 'Envio de álbum concluído com sucesso.');
    } catch (error) {
        logger.error({ err: error, jid, msg: 'Erro durante o envio do álbum.' });
        throw error;
    }
}

/**
 * Envia uma mensagem de texto simples.
 */
export async function sendTextMessage(jid: string, text: string) {
    logger.info({ jid }, 'Iniciando envio de mensagem de texto...');

    if (currentState !== 'OPEN' || !sock) {
        logger.error('[WAPP] Tentativa de envio de texto com o WhatsApp não conectado.');
        throw new Error('WhatsApp não está conectado.');
    }

    try {
        await sock.sendMessage(jid, { text });
        logger.info({ jid }, 'Mensagem de texto enviada com sucesso.');
    } catch (error) {
        logger.error({ err: error, jid, msg: 'Erro durante o envio da mensagem de texto.' });
        throw error;
    }
}