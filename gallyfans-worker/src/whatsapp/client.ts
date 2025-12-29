import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import Redis from 'ioredis';
import pkg from 'baileys-redis-auth';
const { RedisStore } = pkg;
import { config } from '../config.js';
import logger from '../logger.js';

let sock: WASocket | null = null;

/**
 * Initializes the WhatsApp connection using Redis for session storage.
 * This function should only be called once, by the lead instance.
 */
export async function initializeWhatsApp(): Promise<WASocket> {
  if (sock) {
    logger.warn('[WHATSAPP] WhatsApp client already initialized.');
    return sock;
  }

  logger.info('[WHATSAPP] Initializing auth state from Redis...');
  const redis = new Redis(config.redisUrl);
  const store = new RedisStore(redis);

  const { state, saveCreds } = await store.read();
  const { version } = await fetchLatestBaileysVersion();

  const newSock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // QR code should not be needed in production
    logger,
    browser: ['Gallyfans', 'Chrome', '1.0.0'],
  });

  // Important: Bind to the store's saveCreds method
  newSock.ev.on('creds.update', saveCreds);

  newSock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      logger.error(`[WHATSAPP] Connection closed. Reason: ${statusCode}. Reconnecting: ${shouldReconnect}`);
      
      if (shouldReconnect) {
        // The process will be restarted by the environment (e.g., Render)
        // which will re-trigger the leader election.
        logger.fatal('[WHATSAPP] Triggering process exit to force re-election.');
        process.exit(1);
      } else {
        logger.fatal('[WHATSAPP] Not reconnecting, logged out. Manual authentication required.');
        // In case of loggedOut, a manual re-authentication (e.g., running a local script) is needed.
        process.exit(1);
      }
    } else if (connection === 'open') {
      logger.info('[WHATSAPP] WhatsApp connection opened successfully.');
    }
  });

  sock = newSock;
  return sock;
}

/**
 * Returns the existing WhatsApp socket instance.
 * Throws an error if the client is not initialized.
 */
export function getWhatsAppClient(): WASocket {
  if (!sock) {
    throw new Error('WhatsApp client has not been initialized. Call initializeWhatsApp first.');
  }
  return sock;
}