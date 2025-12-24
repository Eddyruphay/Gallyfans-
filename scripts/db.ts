
import * as fs from 'fs/promises';
import { Kysely, SqliteDialect } from 'kysely';
import * as path from 'path';
import initSqlJs from 'sql.js';

// Define the database schema based on your schema.sql
// This is for type safety with Kysely
interface CuratedChannelsTable {
  slug: string;
  description: string | null;
  total_galleries_known: number | null;
  last_scraped_at: string | null;
}

interface GalleriesTable {
  id: number;
  originalId: string | null;
  channel_slug: string | null;
  title: string;
  curated_caption: string | null;
  status: 'indexed' | 'scraped' | 'approved' | 'rejected' | 'failed' | 'removed';
  originalRating: number | null;
  originalViews: number | null;
  scraped_at: string | null;
  created_at: string;
}

interface Database {
  curated_channels: CuratedChannelsTable;
  galleries: GalleriesTable;
  // Add other tables here...
}


const dbPath = path.join('/data/data/com.termux/files/home/4Reels', 'curadoria.db');

async function createDb() {
  const SQL = await initSqlJs({
    locateFile: file => `/data/data/com.termux/files/home/4Reels/node_modules/sql.js/dist/${file}`
  });

  let dbFile: Buffer | null = null;
  try {
    dbFile = await fs.readFile(dbPath);
  } catch (error) {
    // Ignore if the file doesn't exist
  }

  const db = new SQL.Database(dbFile || undefined);

  // Function to save the database
  async function saveDb() {
    const data = db.export();
    await fs.writeFile(dbPath, data);
  }

  const dialect = new SqliteDialect({
    database: async () => db,
  });

  const kysely = new Kysely<Database>({
    dialect,
  });

  return { db: kysely, saveDb };
}

export const db = createDb();
