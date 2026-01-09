import axios from 'axios';
import { config } from '../gally-engine/src/config.js';
import logger from '../gally-engine/src/logger.js';

const API_URL = `http://localhost:${config.port}/api/send-album`;

// This test requires the target channel ID to be set in the environment
if (!config.targetChannelId) {
  logger.fatal('[TEST-CLIENT] The environment variable TARGET_CHANNEL_ID is required for this test script.');
}

// --- Test Data ---
// The payload now includes the destination address (jid)
const testPayload = {
  jid: config.targetChannelId,
  caption: '📸 Hello Gally! This is a test album sent via the new API endpoint. 🚀',
  images: [
    'https://i.imgur.com/e4p2A5H.jpeg', // Example image 1
    'https://i.imgur.com/5d5H2V3.jpeg', // Example image 2
    'https://i.imgur.com/M2A8yJc.jpeg', // Example image 3
  ],
};
// -----------------

async function runTest() {
  logger.info(`[TEST-CLIENT] Enviando requisição para: ${API_URL}`);
  logger.info({ payload: testPayload }, '[TEST-CLIENT] Conteúdo da requisição:');

  if (!config.apiKey) {
    logger.error('[TEST-CLIENT] A variável de ambiente API_KEY não está definida. O script não pode continuar.');
    return;
  }

  try {
    const response = await axios.post(API_URL, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': config.apiKey,
      },
    });

    logger.info({
      status: response.status,
      data: response.data,
    }, '[TEST-CLIENT] Resposta do servidor recebida com sucesso!');

  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response) {
      logger.error({
        status: error.response.status,
        data: error.response.data,
      }, '[TEST-CLIENT] Erro na requisição! O servidor respondeu com um erro.');
    } else {
      logger.error({ err: error }, '[TEST-CLIENT] Erro inesperado ao tentar se comunicar com o servidor.');
    }
  }
}

runTest();
