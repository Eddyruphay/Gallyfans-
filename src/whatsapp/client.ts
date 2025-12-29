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

  const usePairingCode = !state.creds?.registered && !!process.env.PAIRING_PHONE_NUMBER;

  if (usePairingCode) {
    logger.info('[WHATSAPP] No session found. Attempting to pair with phone number...');
  }

  const newSock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: !usePairingCode, // Disable QR code if using pairing code
    logger,
    browser: ['Gallyfans', 'Chrome', '1.0.0'],
    shouldIgnoreJid: jid => jid?.includes('@broadcast'),
    generateHighQualityLinkPreview: true,
    patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(
            message.buttonsMessage 
            || message.templateMessage
            || message.listMessage
        );
        if (requiresPatch) {
            message = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadataVersion: 2,
                            deviceListMetadata: {},
                        },
                        ...message,
                    },
                },
            };
        }
        return message;
    },
    ...(usePairingCode && { pairingCode: process.env.PAIRING_PHONE_NUMBER }),
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
        // Clear the invalid session from Redis
        await redis.del('creds');
        await redis.del('keys');
        process.exit(1);
      } else {
        logger.error(`[WHATSAPP] Connection closed. Reason: ${statusCode}. Triggering process exit to force re-election.`);
        process.exit(1); // Exit to allow the service to restart and reconnect
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
