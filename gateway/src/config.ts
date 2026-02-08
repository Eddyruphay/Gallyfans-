import 'dotenv/config';
import logger from './logger.js';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    logger.fatal(`Missing required environment variable: ${key}`);
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  // Variáveis de ambiente principais
  targetGroupId: requireEnv('TARGET_GROUP_ID'),
  
  // Configurações do Baileys e do WhatsApp
  waPairingNumber: process.env.WA_PAIRING_NUMBER, // Opcional para pareamento
  delayBetweenMessages: parseInt(process.env.DELAY_BETWEEN_MESSAGES || '5', 10), // Delay em ms

  // Configurações do Servidor da API (Gateway)
  apiPort: parseInt(process.env.PORT || '3000', 10),
  gatewayAuthToken: requireEnv('GATEWAY_AUTH_TOKEN'),
  
  // Limites de Upload
  multerFileSizeLimitMb: parseInt(process.env.MULTER_FILE_SIZE_LIMIT_MB || '50', 10),
  multerFileCountLimit: parseInt(process.env.MULTER_FILE_COUNT_LIMIT || '30', 10),
};
