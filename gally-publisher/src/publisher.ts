import { getPrisma } from './db.js';
import logger from './logger.js';
import { sendAlbumToSessions } from './sessions-api.js';
import { config } from './config.js';

const prisma = getPrisma();

// Estrutura de dados esperada no campo JSON 'images' da tabela 'published_items'
interface JobPayload {
  imageUrls: string[];
  captionData: {
    edition: string;
    by: string;
    models: string[];
  };
}

/**
 * Busca o próximo job pendente na fila e o trava para processamento.
 */
async function getNextJob() {
  try {
    const jobs = await prisma.$queryRaw<any[]>`
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

    if (!jobs || jobs.length === 0) {
      return null; // No pending jobs
    }
    return jobs[0];
  } catch (error) {
    logger.error({ err: error }, '[DB] Error in getNextJob transaction.');
    throw error;
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
  logger.info('[PUBLISHER] Checking for a job to publish...');
  let job: any = null;

  try {
    job = await getNextJob();

    if (!job) {
      logger.info('[PUBLISHER] No pending jobs found.');
      return;
    }

    logger.info({ jobId: job.id }, `[PUBLISHER] Processing job for gallery ID: ${job.gallery_id}`);

    if (!job.images || typeof job.images !== 'object' || Array.isArray(job.images)) {
      throw new Error('Job payload (images field) is missing or not a valid JSON object.');
    }

    const payload: JobPayload = job.images as JobPayload;

    if (!payload.imageUrls || !Array.isArray(payload.imageUrls) || !payload.captionData) {
      throw new Error('Invalid job payload structure. "imageUrls" or "captionData" is missing or invalid.');
    }
    if (payload.imageUrls.length === 0) {
      throw new Error('No image URLs found in the job payload. Cannot publish an empty album.');
    }

    const { imageUrls, captionData } = payload;
    const { edition, by, models } = captionData;

    const captionLines = [
      `Edição: ${edition}`,
      `By: ${by}`,
      `Models: ${models.join(', ')}`,
      '', // Linha em branco para espaçamento
      'Galeria completa 👉 [LINK_PLACEHOLDER]'
    ];
    const finalCaption = captionLines.join('\n');

    logger.info({ jobId: job.id }, `Publishing album with ${imageUrls.length} images via gally-sessions.`);

    // A chamada agora é para a API do nosso outro serviço
    await sendAlbumToSessions(config.targetChannelId, finalCaption, imageUrls);

    await updateJobStatus(job.id, 'published');
    logger.info({ jobId: job.id }, '[PUBLISHER] Job finished successfully.');

  } catch (error: any) {
    logger.error({ err: error, jobId: job?.id }, `[PUBLISHER] Failed to process job.`);
    if (job?.id) {
      await updateJobStatus(job.id, 'failed', error.message);
    }
  }
}