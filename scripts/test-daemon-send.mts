import { checkDaemonHealth, sendMediaToDaemon } from '../src/download.js';
import logger from '../src/logger.js';
import { config } from '../src/config.js';

// JID do grupo de teste, carregado do .env ou hardcoded
const TEST_JID = process.env.TARGET_GROUP_ID || '120363404510855649@g.us';

// Cria um buffer de imagem de placeholder (1x1 pixel PNG transparente)
const placeholderImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

async function runTest() {
  logger.info(`[TEST] Starting daemon validation test...`);
  logger.info(`[TEST] Target JID: ${TEST_JID}`);

  try {
    // 1. Verificar se o daemon está saudável
    logger.info('[TEST] Checking daemon health...');
    const isHealthy = await checkDaemonHealth();
    if (!isHealthy) {
      logger.error('[TEST] ❌ Daemon is not healthy. Aborting test.');
      return;
    }
    logger.info('[TEST] ✅ Daemon is healthy and connected.');

    // 2. Enviar a mensagem de teste
    const caption = `🤖 Mensagem de teste do Daemon\n\n- Horário: ${new Date().toISOString()}\n- Status: OK`;
    
    logger.info('[TEST] Sending test message via daemon...');
    await sendMediaToDaemon(TEST_JID, caption, [placeholderImage]);
    
    logger.info('[TEST] ✅ Test message sent successfully!');
    logger.info('[TEST] Validation complete. The daemon is working as expected.');

  } catch (error) {
    logger.error({ err: error }, '[TEST] ❌ Test failed.');
    process.exit(1);
  }
}

runTest();
