
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import initSqlJs from 'sql.js';

const execAsync = promisify(exec);
const dbPath = path.join('/data/data/com.termux/files/home/4Reels', 'curadoria.db');

async function runCuration() {
  console.log('Starting curation process...');

  const SQL = await initSqlJs({
    locateFile: file => `/data/data/com.termux/files/home/4Reels/node_modules/sql.js/dist/${file}`
  });

  const dbFile = await fs.readFile(dbPath);
  const db = new SQL.Database(dbFile);

  const channelsResult = db.exec("SELECT slug FROM curated_channels");
  if (!channelsResult || channelsResult.length === 0) {
    console.log('No channels found in the database.');
    return;
  }
  const channels = channelsResult[0].values.map(row => ({ slug: row[0] }));

  console.log(`Found ${channels.length} channels to process.`);

  for (const channel of channels) {
    console.log(`Processing channel: ${channel.slug}`);

    // 1. Run get-all-galleries.mts
    try {
      const { stdout, stderr } = await execAsync(`npx tsx /data/data/com.termux/files/home/4Reels/curation/scrapers/get-all-galleries.mts "${channel.slug}"`);
      if (stderr) {
        console.error(`Error scraping all galleries for ${channel.slug}:`, stderr);
      }
      console.log(`STDOUT from get-all-galleries for ${channel.slug}:`, stdout);
      const newGalleries = JSON.parse(stdout);
      console.log(`Found ${newGalleries.length} new galleries for ${channel.slug}`);

      // Update curated_channels table
      db.run("UPDATE curated_channels SET total_galleries_known = ?, last_scraped_at = ? WHERE slug = ?", [newGalleries.length, new Date().toISOString(), channel.slug]);
      console.log(`Updated channel ${channel.slug} with ${newGalleries.length} galleries.`);

      // 2. Run get-gallery-details.mts for each new gallery
      for (const gallery of newGalleries) {
        try {
          const { stdout: detailsStdout, stderr: detailsStderr } = await execAsync(`npx tsx /data/data/com.termux/files/home/4Reels/curation/scrapers/get-gallery-details.mts ${gallery.url}`);
          if (detailsStderr) {
            console.error(`Error scraping details for ${gallery.url}:`, detailsStderr);
            // Update gallery status to 'failed' in the database
            db.run("UPDATE galleries SET status = 'failed' WHERE originalId = ?", [gallery.originalId]);
            continue; // Move to the next gallery
          }
          const galleryDetails = JSON.parse(detailsStdout);
          
          // Save gallery details to the database
          db.run("UPDATE galleries SET status = 'scraped', originalRating = ?, originalViews = ?, scraped_at = ? WHERE originalId = ?", [galleryDetails.stats.rating, galleryDetails.stats.views, new Date().toISOString(), gallery.originalId]);

          console.log(`Successfully scraped details for ${gallery.url}`);
        } catch (error) {
          console.error(`Failed to execute get-gallery-details.mts for ${gallery.url}:`, error);
        }
      }

    } catch (error) {
      console.error(`Failed to execute get-all-galleries.mts for ${channel.slug}:`, error);
    }
  }

  const data = db.export();
  await fs.writeFile(dbPath, data);
  console.log('Curation process finished.');
}

runCuration();
