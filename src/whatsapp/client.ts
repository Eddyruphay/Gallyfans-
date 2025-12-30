import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  Browsers,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { redis } from '../redis.js';
import { useCustomRedisAuthState, clearAuthState } from '../redis-auth-store.js';
import logger from '../logger.js';

let sock: WASocket | null = null;
let connectionState: Partial<ConnectionState> = { connection: 'close' };
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Forward declaration for the main connection function
let connectToWhatsApp: () => Promise<WASocket>;

/**
 * Handles the connection update logic.
 * This is where we detect disconnections and decide whether to reconnect.
 */
const handleConnectionUpdate = async (update: Partial<ConnectionState>) => {
  connectionState = update;
  const { connection, lastDisconnect } = update;
  const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;

  if (connection === 'open') {
    logger.info('[WHATSAPP] Connection opened successfully.');
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
  } else if (connection === 'close') {
    logger.error({ error: lastDisconnect?.error }, `[WHATSAPP] Connection closed. Reason: ${statusCode}`);

    // Check if the disconnection is a terminal error
    if (statusCode === DisconnectReason.loggedOut) {
      logger.fatal('[WHATSAPP] Logged out. Clearing auth state and forcing re-pair.');
      await clearAuthState(redis);
      // The process should be restarted by the orchestrator (e.g., Docker, PM2)
      // to ensure a clean start.
      process.exit(1); 
    } else {
      logger.info('[WHATSAPP] Attempting to reconnect...');
      // Use an exponential backoff or a simple delay
      setTimeout(() => connectToWhatsApp().catch(() => {}), 5000);
    }
  }
};

/**
 * Core function to create and connect a WA socket.
 * This will be called for both initial connection and reconnections.
 */
connectToWhatsApp = (): Promise<WASocket> => {
  return new Promise(async (resolve, reject) => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.fatal('[WHATSAPP] Maximum reconnect attempts reached. Exiting.');
      return reject(new Error('Max reconnect attempts reached.'));
    }
    reconnectAttempts++;

    logger.info(`[WHATSAPP] Initializing connection (Attempt ${reconnectAttempts})...`);
    
    const { state, saveCreds } = await useCustomRedisAuthState(redis);
    const { version } = await fetchLatestBaileysVersion();

    const newSock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: Browsers.ubuntu('Chrome'),
    });

    // Clean up previous listeners before attaching new ones
    if (sock) {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
    }
    
    newSock.ev.on('creds.update', saveCreds);
    newSock.ev.on('connection.update', handleConnectionUpdate);

    // Handle pairing code request
    if (!state.creds?.registered && process.env.PAIRING_PHONE_NUMBER) {
      logger.info('[WHATSAPP] No valid session found. Requesting pairing code...');
      try {
        const code = await newSock.requestPairingCode(process.env.PAIRING_PHONE_NUMBER);
        logger.info(`[WHATSAPP] Your pairing code is: ${code}`);
      } catch (error) {
        logger.error({ error }, '[WHATSAPP] Failed to request pairing code.');
        reject(error);
        return; // Stop further execution
      }
    }

    // This promise resolves when the connection is 'open'
    const waitForOpen = (update: Partial<ConnectionState>) => {
      if (update.connection === 'open') {
        sock = newSock;
        newSock.ev.removeListener('connection.update', waitForOpen);
        resolve(newSock);
      } else if (update.connection === 'close') {
        newSock.ev.removeListener('connection.update', waitForOpen);
        reject(new Boom(update.lastDisconnect?.error));
      }
    };
    newSock.ev.on('connection.update', waitForOpen);
  });
};

/**
 * Initializes the WhatsApp connection and starts health checks.
 * This is the main entry point for the WhatsApp client.
 */
export async function initializeWhatsApp(): Promise<WASocket> {
  if (sock && connectionState.connection === 'open') {
    logger.warn('[WHATSAPP] WhatsApp client already initialized and connected.');
    return sock;
  }
  
  try {
    const connectedSocket = await connectToWhatsApp();
    startHealthCheck(connectedSocket);
    return connectedSocket;
  } catch (error) {
    logger.fatal({ error }, '[WHATSAPP] Failed to initialize WhatsApp connection.');
    throw error;
  }
}

/**
 * Periodically checks if the connection is still alive.
 */
function startHealthCheck(socket: WASocket) {
  const interval = setInterval(() => {
    if (connectionState.connection !== 'open') {
      logger.warn('[HEALTH_CHECK] Connection is not open. Health check skipped.');
      return;
    }

    // getPrivacyTokens is a lightweight way to check the connection
    socket.getPrivacyTokens([]).catch(err => {
      logger.error({ err }, '[HEALTH_CHECK] Health check failed. Connection may be lost.');
      // The main connection.update handler should catch the 'close' event
      // and trigger reconnection, so we don't need to do it here.
    });
  }, 60 * 1000); // Run every 60 seconds

  return interval;
}

/**
 * Returns the existing WhatsApp socket instance.
 */
export function getWhatsAppClient(): WASocket {
  if (!sock || connectionState.connection !== 'open') {
    throw new Error('WhatsApp client is not connected. Current state: ' + connectionState.connection);
  }
  return sock;
}
