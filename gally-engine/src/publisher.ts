import { getPrisma } from './db.js';
import { type Image, type Prisma } from '@prisma/client';
import { config } from './config.js';
import logger from './logger.js';
import { sendAlbum } from './whatsapp.js';

const prisma = getPrisma();

/**
 * Fetches the next available job from the queue, locks it, and updates its status.
 */
async function getNextJob() {
  try {
    // This transaction ensures that we lock the row for processing
    const job = await prisma.$transaction(async (tx) => {
      // Find one pending job, lock it, and update its status to 'processing'
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
        return null; // No pending jobs
      }

      const jobData = nextJobs[0];

      // We need the gallery data to get the images and title
      const gallery = await tx.gallery.findUnique({
        where: { id: jobData.gallery_id },
        include: { images: { orderBy: { position: 'asc' } } },
      });

      if (!gallery) {
        // If the gallery is not found, fail the job immediately
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

    // Extrai as URLs das imagens
    const imageUrls = images.map(img => img.imageUrl);

    // Envia o álbum diretamente pela função interna
    await sendAlbum(config.targetChannelId, galleryTitle, imageUrls);

    // Se a chamada acima não lançar erro, consideramos sucesso
    if (jobId !== null) {
      await updateJobStatus(jobId, 'published');
    }
    logger.info({ jobId }, '[PUBLISHER] Job finished successfully.');

  } catch (error: any) {
    logger.error({ err: error, jobId }, `[PUBLISHER] An error occurred during the publication cycle.`);
    if (jobId !== null) {
      // Se sendAlbum lançar um erro, ele será pego aqui e o status será 'failed'
      await updateJobStatus(jobId, 'failed', error.message);
    }
  }
}