import initSqlJs from 'sql.js';
import fs from 'fs';
import logger from '../src/logger.js';

async function updateGalleryStatus() {
  logger.info('--- ATUALIZANDO STATUS DA GALERIA ---');
  const dbPath = 'curadoria.db';

  if (!fs.existsSync(dbPath)) {
    logger.fatal(`Banco de dados local não encontrado em: ${dbPath}`);
    return;
  }

  try {
    const fileBuffer = fs.readFileSync(dbPath);
    const SQL = await initSqlJs();
    const db = new SQL.Database(fileBuffer);
    logger.info('Conectado ao `curadoria.db`.');

    const galleryTitleToApprove = 'ebony babe roxy fox and her brunette gfs show off their big booties 36940341';
    
    const result = db.run("UPDATE galleries SET status = 'approved' WHERE title = ?", [galleryTitleToApprove]);

    if (result.changes > 0) {
      logger.info(`✅ Status da galeria "${galleryTitleToApprove}" atualizado para 'approved'.`);
    } else {
      logger.warn(`Galeria "${galleryTitleToApprove}" não encontrada ou já está 'approved'.`);
    }
    
    db.close();
    logger.info('--- ATUALIZAÇÃO DE STATUS FINALIZADA ---');

  } catch (error) {
    logger.error('Ocorreu um erro ao atualizar o status da galeria:', error);
  }
}

updateGalleryStatus();
