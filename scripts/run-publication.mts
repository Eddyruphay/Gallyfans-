
import { processAndSendFromCuration } from '../src/download.js';
import logger from '../src/logger.js';

async function main() {
  try {
    await processAndSendFromCuration();
    logger.info('🎉 Main publication script finished.');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Main publication script failed.');
    process.exit(1);
  }
}

main();
