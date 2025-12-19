import makeWASocket, { DisconnectReason, useMultiFileAuthState, type WAMessage, type WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import logger from '../logger.js';

async function connectToWhatsApp(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_temp');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      logger.error(`connection closed due to ${lastDisconnect?.error}, reconnecting ${shouldReconnect}`);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      logger.info('opened connection');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  return sock;
}

export default connectToWhatsApp;
