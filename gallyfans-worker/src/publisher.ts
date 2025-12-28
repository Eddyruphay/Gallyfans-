import { config } from './config.js';
import logger from './logger.js';
import { getNextJob, updateJobStatus } from './services/database.js';
import { whatsappService } from './services/whatsapp.js';
import { acquireLock, releaseLock } from './services/redis.js';

export async function runPublicationCycle() {
  const lockValue = await acquireLock();
  if (!lockValue) {
    return; // Lock not acquired, another cycle is running.
  }

  logger.info('[PUBLISHER] Starting publication cycle...');
  let jobId: number | null = null;

  try {
    if (!whatsappService.sock) {
      logger.warn('[PUBLISHER] WhatsApp client is not connected. Skipping cycle.');
      return;
    }

    const jobData = await getNextJob();

    if (!jobData) {
      logger.info('[PUBLISHER] No job found in the queue. Ending cycle.');
      return;
    }

    jobId = jobData.job.id;
    logger.info({ jobId }, `[PUBLISHER] Processing job. Publishing gallery: "${jobData.gallery.title}"`);

    const { gallery, images } = jobData;
    if (!images || images.length === 0) {
      logger.warn({ jobId }, '[PUBLISHER] Job has no images. Marking as failed.');
      if (jobId) {
        await updateJobStatus(jobId, 'failed', 'No images found in the gallery.');
      }
      return;
    }

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (!image) continue;

      const isFirstImage = i === 0;
      const caption = isFirstImage ? gallery.title : ' ';

      await whatsappService.sendMessage(config.targetChannelId, {
        image: { url: image.imageUrl },
        caption,
      });

      // Add a small delay between messages
      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    if (jobId) {
      await updateJobStatus(jobId, 'published');
    }
    logger.info({ jobId }, '[PUBLISHER] Job finished successfully.');

  } catch (error: any) {
    logger.error({ err: error, jobId }, `[PUBLISHER] An unrecoverable error occurred in the job.`);
    if (jobId) {
      await updateJobStatus(jobId, 'failed', error.message);
    }
  } finally {
    await releaseLock(lockValue);
  }
}