import { PrismaClient, type Image } from '@prisma/client';
import { config } from './config.js';
import logger from './logger.js';
import { getWhatsAppClient } from './whatsapp/client.js';

const prisma = new PrismaClient();

/**
 * Fetches the next available job from the queue, locks it, and updates its status.
 */
async function getNextJob() {
  try {
    const job = await prisma.$transaction(async (tx) => {
      const nextJobs = await tx.$queryRaw<any[]>`
        UPDATE "published_items"
        SET status = 'processing', "processing_started_at" = NOW()
        WHERE id = (
          SELECT id
          FROM "published_items"
          WHERE status = 'pending'
          ORDER BY "created_at" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *;
      `;

      if (!nextJobs || nextJobs.length === 0) {
        return null;
      }

      const jobData = nextJobs[0];

      const gallery = await tx.gallery.findUnique({
        where: { id: jobData.gallery_id },
        include: { images: { orderBy: { position: 'asc' } } },
      });

      if (!gallery) {
        await tx.publishedItem.update({
          where: { id: jobData.id },
          data: { status: 'failed', errorLog: `Gallery with id ${jobData.gallery_id} not found.` },
        });
        return null;
      }

      return {
        job: jobData,
        galleryTitle: gallery.title,
        images: gallery.images,
      };
    });
    return job;
  } catch (error) {
    logger.error({ err: error }, '[DB] Error in getNextJob transaction.');
    throw error; // Rethrow to be caught by the main cycle handler
  }
}

/**
 * Updates the final status of a job.
 */
async function updateJobStatus(jobId: number, status: 'published' | 'failed', errorLog?: string) {
  try {
    await prisma.publishedItem.update({
      where: { id: jobId },
      data: {
        status,
        errorLog: errorLog || null,
        publishedAt: status === 'published' ? new Date() : null,
      },
    });
    logger.info({ jobId, status }, '[DB] Job status updated successfully.');
  } catch (error) {
    logger.error({ err: error, jobId }, '[DB] Failed to update job status.');
  }
}

/**
 * The main publication cycle logic.
 */
export async function runPublicationCycle() {
  logger.info('[PUBLISHER] Starting publication cycle...');
  let jobId: number | null = null;

  try {
    const jobData = await getNextJob();

    if (!jobData) {
      logger.info('[PUBLISHER] No pending jobs found. Cycle finished.');
      return;
    }

    jobId = jobData.job.id;
    const { galleryTitle, images } = jobData;
    logger.info({ jobId }, `[PUBLISHER] Processing job. Publishing gallery: "${galleryTitle}"`);

    if (!images || images.length === 0) {
      throw new Error('No images found in the gallery.');
    }

    const whatsappClient = getWhatsAppClient();

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (!image) continue; // Safeguard for undefined images in the array
      
      const caption = i === 0 ? galleryTitle : ' ';
      
      await whatsappClient.sendMessage(config.targetChannelId, {
        image: { url: image.imageUrl },
        caption,
      });

      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    if (jobId) {
      await updateJobStatus(jobId, 'published');
    }
    logger.info({ jobId }, '[PUBLISHER] Job finished successfully.');

  } catch (error: any) {
    logger.error({ err: error, jobId }, `[PUBLISHER] An error occurred during the publication cycle.`);
    if (jobId) {
      await updateJobStatus(jobId, 'failed', error.message);
    }
  }
}