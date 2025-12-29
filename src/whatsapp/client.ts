import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  Browsers, // Import Browsers
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
export function initializeWhatsApp(): Promise<WASocket> {
  // Return a promise that resolves only when the connection is open
  return new Promise(async (resolve, reject) => {
    if (sock) {
      logger.warn('[WHATSAPP] WhatsApp client already initialized.');
      return resolve(sock);
    }

    logger.info('[WHATSAPP] Initializing auth state from Redis...');
    
    const { state, saveCreds } = await useCustomRedisAuthState(redis);
    
    const { version } = await fetchLatestBaileysVersion();

    const newSock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false, // Never print QR in production
      logger,
      browser: Browsers.ubuntu('Chrome'),
    });

    // Bind creds update event
    newSock.ev.on('creds.update', saveCreds);

    // This handler will resolve/reject the promise
    const connectionUpdateHandler = async (update: any) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        logger.info('[WHATSAPP] WhatsApp connection opened successfully.');
        sock = newSock;
        newSock.ev.removeListener('connection.update', connectionUpdateHandler);
        resolve(sock);
      } else if (connection === 'close') {
        const error = new Boom(lastDisconnect?.error)?.output;
        logger.error(`[WHATSAPP] Connection closed. Reason: ${error?.statusCode}`);
        newSock.ev.removeListener('connection.update', connectionUpdateHandler);
        reject(lastDisconnect?.error);
      }
    };
    
    newSock.ev.on('connection.update', connectionUpdateHandler);

    // Request pairing code if needed, after setting up listeners
    if (!state.creds?.registered && process.env.PAIRING_PHONE_NUMBER) {
      logger.info('[WHATSAPP] No valid session found. Requesting pairing code...');
      try {
        const code = await newSock.requestPairingCode(process.env.PAIRING_PHONE_NUMBER);
        logger.info(`[WHATSAPP] Your pairing code is: ${code}`);
      } catch (error) {
        logger.error({ error }, '[WHATSAPP] Failed to request pairing code.');
        reject(error);
      }
    }
  });
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
