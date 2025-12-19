import { PrismaClient } from '@prisma/client';
import { config } from './config.js';
import logger from './logger.js';
import connectToWhatsApp from './whatsapp/client.js';
import { Redis } from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(config.redis.url!);

const LOCK_KEY = 'gallyfans-publisher-lock';
const LOCK_TIMEOUT = 300; // 5 minutes

/**
 * Fetches the next available job from the queue directly from the database.
 * It atomically finds a 'queued' job, locks it, and updates its status to 'processing'.
 * Then, it fetches the related gallery and images.
 */
async function getNextJob() {
  try {
    const job = await prisma.$transaction(async (tx) => {
      // Find the next job, lock it, and update its status
      const nextJob = await tx.$queryRaw<any[]>`
        UPDATE "publishing_queue"
        SET status = 'processing'
        WHERE id = (
          SELECT id
          FROM "publishing_queue"
          WHERE status = 'queued'
          ORDER BY "scheduledFor" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *;
      `;

      if (!nextJob || nextJob.length === 0) {
        return null;
      }

      const jobData = nextJob[0];

      // Fetch the associated gallery and images
      const gallery = await tx.gallery.findUnique({
        where: { id: jobData.galleryId },
        include: { images: { orderBy: { position: 'asc' } } },
      });

      if (!gallery) {
        // This case should be rare, but handle it.
        // We'll mark the job as failed so it doesn't get stuck.
        await tx.publishingQueue.update({
          where: { id: jobData.id },
          data: { status: 'failed', errorLog: `Gallery with id ${jobData.galleryId} not found.` },
        });
        return null;
      }

      return {
        job: jobData,
        gallery: { ...gallery, images: undefined }, // Return gallery without images nested
        images: gallery.images,
      };
    });

    return job;
  } catch (error) {
    logger.error({ err: error }, '[DB] Error in getNextJob transaction.');
    return null;
  }
}


async function updateJobStatus(jobId: number, status: 'published' | 'failed', errorLog?: string) {
  try {
    const data: any = {
      status,
      publishedAt: status === 'published' ? new Date() : null,
    };
    if (errorLog) {
      data.errorLog = errorLog;
    }
    await prisma.publishingQueue.update({
      where: { id: jobId },
      data,
    });
    logger.info({ jobId, status }, '[DB] Job status updated successfully.');
  } catch (error) {
    logger.error({ err: error, jobId }, '[DB] Failed to update job status.');
  }
}

export async function runPublicationCycle(whatsappClient: Awaited<ReturnType<typeof connectToWhatsApp>>) {
  const lockValue = Date.now().toString();
  const lock = await redis.set(LOCK_KEY, lockValue, 'EX', LOCK_TIMEOUT, 'NX');

  if (!lock) {
    logger.warn('[PUBLISHER] Could not acquire lock. Another cycle is likely running. Skipping.');
    return;
  }

  logger.info('[PUBLISHER] Lock acquired. Starting publication cycle...');

  let jobId: number | null = null;

  try {
    if (!whatsappClient) {
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
      if (jobId) { await updateJobStatus(jobId, 'failed', 'No images found in the gallery.'); }
      return;
    }

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (!image) {
        continue;
      }
      const isFirstImage = i === 0;
      
      // Use the gallery title for the first image, and a space for subsequent ones to avoid repetition
      const caption = isFirstImage ? gallery.title : ' ';
      
      await whatsappClient.sendMessage(config.targetChannelId, { image: { url: image.imageUrl }, caption });

      // Add a small delay between messages to avoid being flagged as spam
      if (i < images.length - 1) { await new Promise(resolve => setTimeout(resolve, 1500)); }
    }
    
    if (jobId) { await updateJobStatus(jobId, 'published'); }
    logger.info({ jobId }, '[PUBLISHER] Job finished successfully.');

  } catch (error: any) {
    logger.error({ err: error, jobId }, `[PUBLISHER] An unrecoverable error occurred in the job.`);
    if (jobId) {
      await updateJobStatus(jobId, 'failed', error.message);
    }
  } finally {
    if (await redis.get(LOCK_KEY) === lockValue) {
      await redis.del(LOCK_KEY);
      logger.info('[PUBLISHER] Lock released.');
    }
  }
}
