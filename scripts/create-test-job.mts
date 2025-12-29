// scripts/create-test-job.mts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Creates a new job in the publishing queue for testing purposes.
 * It finds the most recent gallery and creates a 'queued' job for it.
 */
async function createTestJob() {
  console.log('[TEST] Attempting to create a new test job...');

  try {
    // 1. Find the most recent gallery to use for the job.
    const latestGallery = await prisma.gallery.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!latestGallery) {
      console.error('[ERROR] No galleries found in the database. Cannot create a test job.');
      console.log('[INFO] Please run the curator script first to create a gallery.');
      return;
    }

    console.log(`[INFO] Found latest gallery: "${latestGallery.title}" (ID: ${latestGallery.id}).`);

    // 2. Create a new job in the publishing queue for that gallery.
    const newJob = await prisma.publishingQueue.create({
      data: {
        galleryId: latestGallery.id,
        targetChannel: 'whatsapp:gallyfans-test', // A clear identifier for a test job
        status: 'queued',
        // editionId is optional, so we omit it for this test.
      },
    });

    console.log(`\n[SUCCESS] Successfully created a new job in the queue!`);
    console.log(`  - Job ID: ${newJob.id}`);
    console.log(`  - Gallery ID: ${newJob.galleryId}`);
    console.log(`  - Status: ${newJob.status}`);

  } catch (error) {
    console.error('[ERROR] Failed to create test job:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestJob();
