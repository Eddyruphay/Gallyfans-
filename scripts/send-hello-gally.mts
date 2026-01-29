import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path, { dirname } from 'path';
import pino from 'pino';
import { fileURLToPath } from 'url';

const logger = pino({ level: 'info' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const authDir = path.resolve(__dirname, '../../baileys_auth_hello');
const groupId = '120363404510855649@g.us'; // Gallyfans Group ID
const message = 'oi gally';

let messageSent = false; // Flag to ensure message is sent only once

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock: WASocket = makeWASocket({ // Added WASocket typings
        auth: state,
        logger,
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            logger.info('Connection closed.');
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                logger.warn('Connection closed unexpectedly. Exiting process as this is a one-shot script.');
                process.exit(1); // Exit on unexpected close for one-shot
            } else {
                logger.info('Logged out, exiting.');
                process.exit(0);
            }
        } else if (connection === 'open') {
            logger.info('Connection opened!');
            if (!messageSent) {
                await sendMessage(sock);
            } else {
                logger.info('Message already sent, closing connection and exiting.');
                sock.end();
                process.exit(0);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
}

async function sendMessage(sock: WASocket) { // Added WASocket typings
    if (!sock.user) { // Basic check for socket readiness
        logger.error('Socket not ready to send message. Exiting.');
        sock.end();
        process.exit(1);
        return;
    }

    try {
        logger.info(`Sending message "${message}" to group ${groupId}...`);
        const sentMsg = await sock.sendMessage(groupId, { text: message });
        if (sentMsg?.key.id) {
            logger.info('Message sent successfully! Message ID:', sentMsg.key.id);
            messageSent = true; // Set flag
        } else {
            logger.error('Message sent but no ID received, potential issue. Exiting.');
        }
    } catch (error) {
        logger.error('Error sending message:', error);
        process.exit(1); // Exit on send error
    } finally {
        logger.info('Message sending attempt complete. Closing socket and exiting process.');
        sock.end(); // End socket
        process.exit(0); // Exit process
    }
}

connectToWhatsApp().catch(err => {
    logger.error("Unexpected error during WhatsApp connection:", err);
    process.exit(1);
});
