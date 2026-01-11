
import initSqlJs from 'sql.js';
import fs from 'fs';

const logger = {
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
};

/**
 * Helper function to execute a query with sql.js and return results.
 */
const query = (db: any, sql: string): any[] => {
  const results = [];
  const stmt = db.prepare(sql);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
};

async function checkStatus() {
  try {
    logger.info('Loading curadoria.db to check gallery statuses...');
    const fileBuffer = fs.readFileSync('curadoria.db');
    const SQL = await initSqlJs();
    const db = new SQL.Database(fileBuffer);
    logger.info('Database loaded.');

    const statuses = query(db, `
      SELECT status, COUNT(*) as count 
      FROM galleries 
      GROUP BY status
    `);

    if (statuses.length > 0) {
      logger.info('Gallery status distribution:');
      console.table(statuses);
    } else {
      logger.info('No galleries found in the database.');
    }

    db.close();
  } catch (err) {
    logger.error('Failed to check gallery statuses:', err);
  }
}

checkStatus();
