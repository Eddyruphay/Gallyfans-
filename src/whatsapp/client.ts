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
let isConnecting = false; // Mutex to prevent concurrent connections
let healthCheckInterval: NodeJS.Timeout | null = null;

// Forward declaration
let connectToWhatsApp: () => Promise<WASocket>;

const handleConnectionUpdate = async (update: Partial<ConnectionState>) => {
  connectionState = update;
  const { connection, lastDisconnect } = update;
  const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;

  if (connection === 'open') {
    logger.info('[WHATSAPP] Connection opened successfully.');
    reconnectAttempts = 0;
  } else if (connection === 'close') {
    logger.error({ error: lastDisconnect?.error }, `[WHATSAPP] Connection closed. Reason: ${statusCode}`);

    if (statusCode === DisconnectReason.loggedOut) {
      logger.fatal('[WHATSAPP] Logged out. Clearing auth state and forcing re-pair.');
      await clearAuthState(redis);
      process.exit(1);
    } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = (reconnectAttempts + 1) * 5000; // Simple linear backoff
      logger.info(`[WHATSAPP] Attempting to reconnect in ${delay / 1000}s...`);
      setTimeout(() => connectToWhatsApp().catch(() => {}), delay);
    } else {
        logger.fatal('[WHATSAPP] Maximum reconnect attempts reached. Exiting.');
        process.exit(1);
    }
  }
};

connectToWhatsApp = (): Promise<WASocket> => {
  return new Promise(async (resolve, reject) => {
    if (isConnecting) {
      logger.warn('[WHATSAPP] Connection attempt already in progress.');
      return reject(new Error('Connection already in progress'));
    }
    isConnecting = true;
    reconnectAttempts++;

    logger.info(`[WHATSAPP] Initializing connection (Attempt ${reconnectAttempts})...`);

    let newSock: WASocket;

    const connectionPromise = new Promise<WASocket>(async (innerResolve, innerReject) => {
      try {
        const [{ state, saveCreds }, { version }] = await Promise.all([
            useCustomRedisAuthState(redis),
            fetchLatestBaileysVersion()
        ]);

        newSock = makeWASocket({
          version,
          auth: state,
          printQRInTerminal: false,
          logger,
          browser: Browsers.ubuntu('Chrome'),
        });

        if (sock) {
          sock.ev.removeAllListeners();
        }
        
        newSock.ev.on('creds.update', saveCreds);
        newSock.ev.on('connection.update', handleConnectionUpdate);

        if (!state.creds?.registered && process.env.PAIRING_PHONE_NUMBER) {
          logger.info('[WHATSAPP] No valid session found. Requesting pairing code...');
          const code = await newSock.requestPairingCode(process.env.PAIRING_PHONE_NUMBER);
          logger.info(`[WHATSAPP] Your pairing code is: ${code}`);
        }

        const waitForOpen = (update: Partial<ConnectionState>) => {
          const cleanup = () => newSock.ev.removeListener('connection.update', waitForOpen);
          
          if (update.connection === 'open') {
            cleanup();
            innerResolve(newSock);
          } else if (update.connection === 'close') {
            cleanup();
            innerReject(new Boom(update.lastDisconnect?.error));
          }
        };
        newSock.ev.on('connection.update', waitForOpen);

      } catch (error) {
        innerReject(error);
      }
    });

    try {
        const connectedSocket = await Promise.race([
            connectionPromise,
            new Promise<WASocket>((_, innerReject) => 
                setTimeout(() => innerReject(new Error('Connection timed out after 30s')), 30000)
            )
        ]);
        
        sock = connectedSocket;
        resolve(sock);
    } catch (error) {
        logger.error({ error }, '[WHATSAPP] Failed to connect.');
        newSock?.end(error as Error);
        reject(error);
    } finally {
        isConnecting = false;
    }
  });
};

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

function startHealthCheck(socket: WASocket) {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(() => {
    if (connectionState.connection !== 'open') {
      logger.warn('[HEALTH_CHECK] Connection is not open. Skipping health check.');
      return;
    }

    Promise.race([
      socket.getPrivacyTokens([]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
    ]).catch(err => {
      logger.error({ err }, '[HEALTH_CHECK] Health check failed. Connection may be lost.');
    });
  }, 60 * 1000);
}

export function getWhatsAppClient(): WASocket {
  if (!sock || connectionState.connection !== 'open') {
    throw new Error('WhatsApp client is not connected. Current state: ' + connectionState.connection);
  }
  return sock;
}
