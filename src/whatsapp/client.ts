import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { redis } from '../redis.js'; // Import the shared redis instance
import { useCustomRedisAuthState } from '../redis-auth-store.js';
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
  
  // The shared redis instance is already connected on startup.
  // We can use it directly.
  const { state, saveCreds } = await useCustomRedisAuthState(redis);
  
  const { version } = await fetchLatestBaileysVersion();

  const newSock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
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
        logger.fatal('[WHATSAPP] Triggering process exit to force re-election.');
        process.exit(1);
      } else {
        logger.fatal('[WHATSAPP] Not reconnecting, logged out. Manual authentication required.');
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
