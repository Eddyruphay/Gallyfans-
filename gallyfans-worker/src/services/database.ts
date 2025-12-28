import { PrismaClient } from '@prisma/client';
import logger from '../logger.js';

const prisma = new PrismaClient();

/**
 * Fetches the next available job from the queue directly from the database.
 * It atomically finds a 'queued' job, locks it, and updates its status to 'processing'.
 * Then, it fetches the related gallery and images.
 */
export async function getNextJob() {
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
          ORDER BY "scheduled_for" ASC
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
        where: { id: jobData.gallery_id },
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

/**
 * Updates the status of a job in the publishing queue.
 * @param jobId The ID of the job to update.
 * @param status The new status ('published' or 'failed').
 * @param errorLog An optional error message if the job failed.
 */
export async function updateJobStatus(jobId: number, status: 'published' | 'failed', errorLog?: string) {
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
