
import { db as dbPromise } from './db.js'; // Assuming you have a db connection setup
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runCuration() {
  console.log('Starting curation process...');
  const db = await dbPromise;

  const channels = await db.selectFrom('curated_channels').selectAll().execute();

  for (const channel of channels) {
    console.log(`Processing channel: ${channel.slug}`);

    // 1. Run get-all-galleries.mts
    try {
      const { stdout, stderr } = await execAsync(`npx ts-node /data/data/com.termux/files/home/4Reels/curation/scrapers/get-all-galleries.mts ${channel.slug}`);
      if (stderr) {
        console.error(`Error scraping all galleries for ${channel.slug}:`, stderr);
        continue; // Move to the next channel
      }
      const newGalleries = JSON.parse(stdout);
      console.log(`Found ${newGalleries.length} new galleries for ${channel.slug}`);

      // 2. Run get-gallery-details.mts for each new gallery
      for (const gallery of newGalleries) {
        try {
          const { stdout: detailsStdout, stderr: detailsStderr } = await execAsync(`npx ts-node /data/data/com.termux/files/home/4Reels/curation/scrapers/get-gallery-details.mts ${gallery.url}`);
          if (detailsStderr) {
            console.error(`Error scraping details for ${gallery.url}:`, detailsStderr);
            // Update gallery status to 'failed' in the database
            await db.updateTable('galleries').set({ status: 'failed' }).where('originalId', '=', gallery.originalId).execute();
            continue; // Move to the next gallery
          }
          const galleryDetails = JSON.parse(detailsStdout);
          
          // Save gallery details to the database
          await db.updateTable('galleries')
            .set({
              status: 'scraped',
              originalRating: galleryDetails.stats.rating,
              originalViews: galleryDetails.stats.views,
              scraped_at: new Date().toISOString(),
            })
            .where('originalId', '=', gallery.originalId)
            .execute();

          console.log(`Successfully scraped details for ${gallery.url}`);
        } catch (error) {
          console.error(`Failed to execute get-gallery-details.mts for ${gallery.url}:`, error);
        }
      }

    } catch (error) {
      console.error(`Failed to execute get-all-galleries.mts for ${channel.slug}:`, error);
    }
  }

  console.log('Curation process finished.');
}

runCuration();
