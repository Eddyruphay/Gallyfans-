import express from 'express';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import { promises as fs } from 'fs';
import { config } from '../gateway/src/config.js';
import logger from '../gateway/src/logger.js';

const app = express();
const PAIRING_PORT = process.env.PAIRING_PORT || 3001;

app.use(express.json());

// Logger para Baileys
const baileysLogger = pino({ level: 'silent' }); // Use 'info' ou 'debug' para mais logs

const SESSION_DIR = 'session'; // Usar o mesmo diretório de sessão do client.ts

interface PairingCodeResponse {
    status: string;
    message?: string;
    pairingCode?: string;
    error?: string;
}

// Função para iniciar o socket Baileys e solicitar o código de pareamento
async function startPairingSock(phoneNumber: string): Promise<PairingCodeResponse> {
    await fs.mkdir(SESSION_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    const sock = makeWASocket({
        logger: baileysLogger,
        auth: state,
        browser: ['Chrome', 'Android', '143.0.0.0'], // Usar a mesma configuração de browser do client.ts
        printQRInTerminal: false,
    });

    let pairingCodePromiseResolve: (value: PairingCodeResponse) => void;
    const pairingCodePromise = new Promise<PairingCodeResponse>((resolve) => {
        pairingCodePromiseResolve = resolve;
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            logger.warn(`[PAIRING] Conexão fechada devido a ${lastDisconnect?.error}, reconectando: ${shouldReconnect}`);
            if (shouldReconnect) {
                pairingCodePromiseResolve({ status: 'error', error: 'Conexão fechada, tente novamente.' });
            } else {
                pairingCodePromiseResolve({ status: 'error', error: 'Desconectado. Por favor, emparelhe novamente.' });
            }
            sock.end(undefined); // Encerrar o socket após o erro ou logout
        } else if (connection === 'open') {
            logger.info('[PAIRING] Conexão aberta com sucesso!');
            pairingCodePromiseResolve({ status: 'success', message: 'Conectado com sucesso!' });
            sock.end(undefined); // Encerrar o socket após a conexão bem-sucedida (se não for para parear)
        }

        if (connection === 'connecting' && !qr) {
            try {
                logger.info(`[PAIRING] Solicitando código de pareamento para ${phoneNumber}...`);
                // Adicione um pequeno atraso antes de solicitar o código de emparelhamento
                await new Promise(resolve => setTimeout(resolve, 10000)); // 10 segundos de atraso
                logger.info(`[PAIRING] Estado da conexão antes de solicitar código: ${sock.ws.readyState}`);
                const code = await sock.requestPairingCode(phoneNumber);
                logger.info(`[PAIRING] Código de Emparelhamento gerado: ${code}`);
                pairingCodePromiseResolve({ status: 'success', pairingCode: code });
                sock.end(undefined); // Encerrar o socket após gerar o código
            } catch (error) {
                logger.error({ err: error }, '[PAIRING] Erro ao solicitar código de emparelhamento.');
                pairingCodePromiseResolve({ status: 'error', error: 'Falha ao gerar código de emparelhamento.' });
                sock.end(undefined); // Encerrar o socket em caso de erro
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    return pairingCodePromise;
}

// Endpoint para solicitar o código de emparelhamento
app.post('/pair', async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({ status: 'error', message: 'Número de telefone é obrigatório.' });
    }

    const formattedPhoneNumber = phoneNumber.replace(/\D/g, '');
    if (!formattedPhoneNumber) {
        return res.status(400).json({ status: 'error', message: 'Número de telefone inválido.' });
    }

    try {
        logger.info(`[PAIRING_SERVICE] Recebida requisição para parear número: ${formattedPhoneNumber}`);
        const result = await startPairingSock(formattedPhoneNumber);
        if (result.status === 'success' && result.pairingCode) {
            res.json({ status: 'success', pairingCode: result.pairingCode });
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        logger.error({ err: error }, '[PAIRING_SERVICE] Erro no endpoint /pair.');
        res.status(500).json({ status: 'error', message: 'Erro interno do servidor.' });
    }
});

app.listen(PAIRING_PORT, () => {
    logger.info(`[PAIRING_SERVICE] Servidor de pareamento rodando na porta ${PAIRING_PORT}`);
});
