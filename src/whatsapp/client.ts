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
export async function initializeWhatsApp(): Promise<WASocket> {
  if (sock) {
    logger.warn('[WHATSAPP] WhatsApp client already initialized.');
    return sock;
  }

  logger.info('[WHATSAPP] Initializing auth state from Redis...');
  
  const { state, saveCreds } = await useCustomRedisAuthState(redis);
  
  const { version } = await fetchLatestBaileysVersion();

  const newSock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // Never print QR in production
    logger,
    browser: Browsers.ubuntu('Chrome'), // Set a valid browser
  });

  // Important: Bind to the store's saveCreds method
  newSock.ev.on('creds.update', saveCreds);

  newSock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      logger.info('[WHATSAPP] WhatsApp connection opened successfully.');
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      
      if (statusCode === DisconnectReason.loggedOut) {
        logger.fatal('[WHATSAPP] Logged out. Deleting session from Redis and exiting. Please provide the PAIRING_PHONE_NUMBER environment variable to re-authenticate.');
        await redis.del('creds');
        await redis.del('keys');
        process.exit(1);
      } else {
        logger.error(`[WHATSAPP] Connection closed. Reason: ${statusCode}. Triggering process exit to force re-election.`);
        process.exit(1); // Exit to allow the service to restart and reconnect
      }
    }

    // Handle pairing code generation
    if (!state.creds?.registered && process.env.PAIRING_PHONE_NUMBER) {
      try {
        const code = await newSock.requestPairingCode(process.env.PAIRING_PHONE_NUMBER);
        logger.info(`[WHATSAPP] Your pairing code is: ${code}`);
      } catch (error) {
        logger.error({ error }, '[WHATSAPP] Failed to request pairing code.');
        process.exit(1);
      }
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
