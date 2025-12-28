import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type AnyMessageContent,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { config } from '../config.js';
import logger from '../logger.js';

class WhatsAppService {
  private static instance: WhatsAppService;
  public sock: WASocket | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  async initialize() {
    if (this.isInitialized) {
      logger.warn('[WHATSAPP] Service is already initialized.');
      return;
    }

    logger.info('[WHATSAPP] Initializing WhatsApp service...');
    const { state, saveCreds } = await useMultiFileAuthState(config.baileysAuthPath);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        logger.error(`[WHATSAPP] Connection closed due to ${lastDisconnect?.error}, reconnecting: ${shouldReconnect}`);
        if (shouldReconnect) {
          this.initialize();
        }
      } else if (connection === 'open') {
        logger.info('[WHATSAPP] Connection opened.');
      }
    });

    this.isInitialized = true;
    logger.info('[WHATSAPP] Service initialized.');
  }

  public async sendMessage(jid: string, content: AnyMessageContent) {
    if (!this.sock || !this.isInitialized) {
      logger.error('[WHATSAPP] Cannot send message, client is not initialized.');
      throw new Error('WhatsApp client is not initialized.');
    }
    try {
      await this.sock.sendMessage(jid, content);
      logger.info({ jid }, '[WHATSAPP] Message sent successfully.');
    } catch (error) {
      logger.error({ err: error, jid }, '[WHATSAPP] Failed to send message.');
      throw error;
    }
  }
}

export const whatsappService = WhatsAppService.getInstance();
