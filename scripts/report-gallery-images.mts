import initSqlJs from 'sql.js';
import fs from 'fs';
import logger from '../src/logger.js';

interface GalleryImageCount {
  title: string;
  image_count: number;
}

async function reportGalleryImages() {
  logger.info('--- GERANDO RELATÓRIO DE IMAGENS POR GALERIA ---');
  const dbPath = 'curadoria.db';

  if (!fs.existsSync(dbPath)) {
    logger.fatal(`Banco de dados local não encontrado em: ${dbPath}`);
    return;
  }

  try {
    const fileBuffer = fs.readFileSync(dbPath);
    const SQL = await initSqlJs();
    const db = new SQL.Database(fileBuffer);
    logger.info('Conectado ao `curadoria.db`. Buscando dados...');

    const query = `
      SELECT
        g.title,
        COUNT(i.id) AS image_count
      FROM
        galleries AS g
      LEFT JOIN
        images AS i ON g.id = i.galleryId
      GROUP BY
        g.id, g.title
      ORDER BY
        image_count DESC;
    `;

    const stmt = db.prepare(query);
    const results: GalleryImageCount[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push({
        title: row.title,
        image_count: Number(row.image_count)
      });
    }
    stmt.free();
    
    logger.info('--- RELATÓRIO DE CONTAGEM DE IMAGENS ---');
    console.log('');
    console.log('Contagem de Imagens | Título da Galeria');
    console.log('--------------------|------------------------------------------');

    if (results.length > 0) {
      results.forEach(item => {
        const countStr = String(item.image_count).padStart(19, ' ');
        console.log(`${countStr} | ${item.title}`);
      });
    } else {
      console.log('Nenhuma galeria encontrada.');
    }
    
    console.log('');
    logger.info('--- FIM DO RELATÓRIO ---');

    db.close();

  } catch (error) {
    logger.error('Ocorreu um erro ao gerar o relatório:', error);
  }
}

reportGalleryImages();
