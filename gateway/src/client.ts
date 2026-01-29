import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { promises as fs } from 'fs';
import { Boom } from '@hapi/boom';
import express from 'express';
import multer from 'multer';
import http from 'http';
import { config } from './config.js';
import logger from './logger.js';
import { Buffer } from 'buffer';

const SESSION_DIR = 'session';
let sock: WASocket | undefined;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 5 * 60 * 1000; // 5 minutos

type WAConnectionState = 'CONNECTING' | 'OPEN' | 'CLOSED' | 'ERROR';
let currentState: WAConnectionState = 'CLOSED';
let connectionStartTime: number = 0;

function getWAConnectionState(): WAConnectionState {
  return currentState;
}

// Validação de JID do WhatsApp
function isValidJID(jid: string): boolean {
  // Formato: número@s.whatsapp.net ou número@g.us (grupo)
  return /^\d+@(s\.whatsapp\.net|g\.us)$/.test(jid);
}

async function connectToWhatsApp() {
  logger.info(`[WAPP] Connecting to WhatsApp using session dir: ${SESSION_DIR}...`);
  currentState = 'CONNECTING';

  await fs.mkdir(SESSION_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  // 🔥 CRÍTICO: Verificar se tem credenciais
  if (!state.creds.registered) {
    logger.error('[WAPP] ❌ No authentication session found in session/creds.json');
    logger.error('[WAPP] Please run: npx tsx scripts/warm-up-session.mts first');
    process.exit(1);
  }

  // 🔥 CRÍTICO: Usar fetchLatestBaileysVersion
  const { version } = await fetchLatestBaileysVersion();
  logger.info({ version }, '[WAPP] Using Baileys version');

  // 🔥 CRÍTICO: Logger silencioso do Baileys (igual ao warm-up)
  const baileysLogger = pino({ level: 'silent' });

  sock = makeWASocket({
    version, // 👈 OBRIGATÓRIO
    auth: state,
    logger: baileysLogger, // 👈 USAR LOGGER SILENCIOSO
    printQRInTerminal: false,
    browser: Browsers.macOS('Chrome'),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection) {
      const upperCaseConnection = connection.toUpperCase() as WAConnectionState;
      currentState = ['OPEN', 'CONNECTING', 'CLOSED'].includes(upperCaseConnection)
        ? upperCaseConnection
        : 'CLOSED';
      logger.info(`[WAPP] Connection status updated to: ${currentState}`);
    }

    if (connection === 'close') {
      if (connectionStartTime) {
        const durationInSeconds = (Date.now() - connectionStartTime) / 1000;
        logger.info(`[WAPP] Session was active for ${durationInSeconds.toFixed(2)} seconds.`);
        connectionStartTime = 0;
      }

      const boomError = lastDisconnect?.error as Boom;
      const statusCode = boomError?.output?.statusCode;

      logger.warn({
        err: boomError,
        statusCode,
        message: boomError?.message,
      }, `[WAPP] 🔌 Connection closed.`);

      if (statusCode === DisconnectReason.loggedOut) {
        currentState = 'ERROR';
        logger.error('[WAPP] ❌ LOGGED OUT. Session is invalid. Delete session/ and restart.');
        process.exit(1);
      } 
      // 🔥 Tratamento específico do erro 405
      else if (statusCode === 405) {
        logger.warn('[WAPP] ⚠️ Error 405: Connection Failure detected.');
        logger.info('[WAPP] 💡 This usually means the session needs warm-up.');
        logger.info('[WAPP] 💡 Please run: npx tsx scripts/warm-up-session.mts');
        logger.info('[WAPP] Retrying connection in 10 seconds...');
        
        setTimeout(connectToWhatsApp, 10000);
      }
      else if (statusCode === DisconnectReason.connectionClosed || 
               statusCode === DisconnectReason.connectionLost) {
        const delay = Math.min(Math.pow(2, reconnectAttempts) * 5000, MAX_RECONNECT_DELAY);
        logger.info(`[WAPP] Reconnecting in ${delay / 1000}s... (Attempt ${reconnectAttempts + 1})`);
        reconnectAttempts++;
        setTimeout(connectToWhatsApp, delay);
      } else {
        logger.error({ statusCode }, "[WAPP] Unhandled disconnection. Won't reconnect.");
      }
    } else if (connection === 'open') {
      connectionStartTime = Date.now();
      reconnectAttempts = 0;
      currentState = 'OPEN';
      logger.info('[WAPP] ✅ WhatsApp connection established!');
    }
  });

  // Ouvinte para novas mensagens
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    // Ignorar notificações de status e mensagens sem conteúdo
    if (!msg.message) return;

    const sender = msg.key.remoteJid;
    const messageContent = JSON.stringify(msg.message);
    
    logger.info({
      from: sender,
      type: m.type,
      message: messageContent
    }, '[WAPP] 📩 New message received');

    // Aqui podemos adicionar lógica para responder a comandos, etc.
    // Exemplo: if (messageContent.includes('!ping')) { sock.sendMessage(sender, { text: 'pong' }) }
  });
}

async function closeWhatsApp() {
  if (sock) {
    logger.info('[WAPP] Closing WhatsApp connection...');
    const closed = new Promise<void>((resolve) => {
      const listener = (update: { connection?: string }) => {
        if (update.connection === 'close') {
          sock?.ev.removeListener('connection.update', listener);
          resolve();
        }
      };
      sock.ev.on('connection.update', listener);
    });

    sock.end(undefined);

    await Promise.race([
      closed,
      new Promise(resolve => setTimeout(resolve, 10000)) // 10s timeout
    ]);

    logger.info('[WAPP] Connection closed.');
  }
}

async function sendMediaJob(jid: string, caption: string = '', imageBuffers: Buffer[]) {
  logger.info({ jid, imageCount: imageBuffers.length }, '[WAPP] Sending media job (native strategy)...');

  if (currentState !== 'OPEN' || !sock) {
    throw new Error('WhatsApp not connected.');
  }
  if (!isValidJID(jid)) {
    throw new Error(`Invalid JID: ${jid}`);
  }
  // A sugestão menciona que o WhatsApp só agrupa de 2 a 30 imagens.
  if (imageBuffers.length < 2 || imageBuffers.length > 30) {
    throw new Error(`Album must have between 2 and 30 images. You provided ${imageBuffers.length}.`);
  }

  try {
    // Estratégia de micro-delay sequencial
    for (let i = 0; i < imageBuffers.length; i++) {
      const isFirst = i === 0;
      const message = {
        image: imageBuffers[i],
        caption: isFirst ? caption : undefined,
        viewOnce: false,
      };
      
      await sock.sendMessage(jid, message);
      logger.info(`[WAPP] Sent image ${i + 1}/${imageBuffers.length}`);

      // Adiciona um micro-delay entre as mensagens, exceto após a última
      if (i < imageBuffers.length - 1) {
        await new Promise(r => setTimeout(r, 5));
      }
    }

    logger.info({ jid, count: imageBuffers.length }, '✅ TRUE ALBUM process completed!');
  } catch (error) {
    logger.error({ error, jid }, '[WAPP] Album failed with native strategy');
    throw error;
  }
}

// --- Express App ---
const app = express();
const server = http.createServer(app);

// Multer com limites de segurança
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.multerFileSizeLimitMb * 1024 * 1024,
    files: config.multerFileCountLimit,
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

const PORT = config.apiPort;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de logging para requests
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url }, '[API] Incoming request');
  next();
});

// Health check completo
app.get('/health', (req, res) => {
  const state = getWAConnectionState();
  res.status(state === 'OPEN' ? 200 : 503).json({
    status: state === 'OPEN' ? 'healthy' : 'unhealthy',
    whatsapp: state,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

// Status simplificado (compatibilidade)
app.get('/status', (req, res) => {
  res.status(200).json({ 
    status: getWAConnectionState(),
    connected: getWAConnectionState() === 'OPEN',
  });
});

// Middleware de autenticação para proteger endpoints sensíveis
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers['x-auth-token'];
  if (!token || token !== config.gatewayAuthToken) {
    logger.warn({ 
      url: req.url, 
      ip: req.ip,
      tokenProvided: !!token 
    }, '[API] Unauthorized access attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Publish job endpoint
app.post('/publish', authMiddleware, upload.array('images'), async (req, res) => {
  const { jid, caption } = req.body;
  const files = req.files as Express.Multer.File[];

  logger.info({ jid, fileCount: files?.length }, '[API] /publish request received');

  // Validações
  if (getWAConnectionState() !== 'OPEN') {
    logger.warn('[API] Request rejected: WhatsApp not connected');
    return res.status(503).json({ 
      error: 'WhatsApp client is not connected.',
      state: getWAConnectionState()
    });
  }

  if (!jid) {
    return res.status(400).json({ error: 'Missing "jid" parameter' });
  }

  if (!isValidJID(jid)) {
    return res.status(400).json({ 
      error: 'Invalid JID format. Expected: number@s.whatsapp.net or number@g.us' 
    });
  }

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No images provided' });
  }

  try {
    const imageBuffers = files.map(file => file.buffer);
    await sendMediaJob(jid, caption || '', imageBuffers);
    
    logger.info({ jid, imageCount: imageBuffers.length }, '[API] ✅ Media sent successfully');
    
    res.status(200).json({ 
      success: true, 
      messagesSent: imageBuffers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error({ err: error, jid }, '[API] Failed to send media');
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send album',
      message: error.message 
    });
  }
});

// Error handler para Multer
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    logger.error({ err: error }, '[API] Multer error');
    return res.status(400).json({ 
      error: 'File upload error', 
      message: error.message 
    });
  }
  if (error) {
    logger.error({ err: error }, '[API] Unexpected error');
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
  next();
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('[DAEMON] 🛑 Shutdown signal received. Closing gracefully...');
  
  server.close(() => {
    logger.info('[DAEMON] HTTP server closed');
  });

  await closeWhatsApp();
  
  logger.info('[DAEMON] ✅ Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, '[DAEMON] Uncaught exception!');
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, '[DAEMON] Unhandled rejection');
});

// Start the server and connect to WhatsApp
(async () => {
  try {
    logger.info('[DAEMON] Starting WhatsApp daemon...');
    await connectToWhatsApp();
    
    server.listen(PORT, () => {
      logger.info(`[DAEMON] 🚀 Server listening on http://localhost:${PORT}`);
      logger.info('[DAEMON] Endpoints:');
      logger.info(`[DAEMON]   GET  /health      - Complete health check`);
      logger.info(`[DAEMON]   GET  /status      - Connection status`);
      logger.info(`[DAEMON]   POST /publish    - Publish job`);
    });
  } catch (error) {
    logger.fatal({ err: error }, '[DAEMON] Failed to initialize');
    process.exit(1);
  }
})();
