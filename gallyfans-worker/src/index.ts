import { runPublicationCycle } from './publisher.js';
import connectToWhatsApp from './whatsapp/client.js';
import logger from './logger.js';
import { config } from './config.js';

async function main() {
  try {
    const whatsappClient = await connectToWhatsApp();
    logger.info('[MAIN] WhatsApp client connected.');

    // Run the publication cycle every X minutes
    setInterval(() => {
      runPublicationCycle(whatsappClient);
    }, config.publicationIntervalMs);

    // Initial run
    runPublicationCycle(whatsappClient);
  } catch (error) {
    logger.fatal({ err: error }, '[MAIN] Failed to start the application.');
    process.exit(1);
  }
}

main();
