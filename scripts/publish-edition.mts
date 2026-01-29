import initSqlJs from 'sql.js';
import fs from 'fs';
import logger from '../src/logger.js';
import { initWhatsApp, closeWhatsApp, sendAlbumWithBuffers } from '../src/client.js';
import { downloadImageAsBuffer } from '../src/download.js';
import { config } from '../src/config.js';

// Helper para executar queries no DB SQLite
const query = (db: any, sql: string, params: any[] = []): any[] => {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
};

async function publishApprovedEdition() {
  logger.info('--- INICIANDO PROCESSO DE PUBLICAÇÃO ---');

  // 1. Conectar ao banco de dados local
  const dbPath = 'curadoria.db';
  if (!fs.existsSync(dbPath)) {
    logger.fatal(`Banco de dados local não encontrado em: ${dbPath}`);
    return;
  }
  const fileBuffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fileBuffer);
  logger.info('Conectado ao banco de dados local `curadoria.db`.');

  try {
    // 2. Encontrar a primeira galeria aprovada
    const approvedGalleries = query(db, "SELECT id, title, curated_caption FROM galleries WHERE status = 'approved' LIMIT 1");
    if (approvedGalleries.length === 0) {
      logger.info('Nenhuma galeria com status "approved" encontrada. Encerrando.');
      return;
    }
    const gallery = approvedGalleries[0];
    logger.info(`Galeria encontrada para publicação: "${gallery.title}" (ID: ${gallery.id})`);

    // 3. Buscar as URLs de imagem para a galeria
    const images = query(db, 'SELECT imageUrl FROM images WHERE galleryId = ? ORDER BY position', [gallery.id]);
    if (images.length === 0) {
      logger.warn(`Galeria (ID: ${gallery.id}) está aprovada mas não tem imagens. Marcando como 'rejected'.`);
      db.run("UPDATE galleries SET status = 'rejected' WHERE id = ?", [gallery.id]);
      return;
    }
    const imageUrls = images.map(img => img.imageUrl);
    logger.info(`Encontradas ${imageUrls.length} imagens para a galeria.`);

    // 4. Baixar todas as imagens como buffers
    logger.info('Iniciando download das imagens...');
    const imageBuffers = await Promise.all(
      imageUrls.map(url => downloadImageAsBuffer(url))
    );
    logger.info('Download de todas as imagens concluído.');

    // 5. Conectar ao WhatsApp
    logger.info('Iniciando conexão com o WhatsApp...');
    await initWhatsApp();

    // 6. Enviar o álbum de buffers
    const caption = `${gallery.title}\n\n${gallery.curated_caption || ''}`.trim();
    await sendAlbumWithBuffers(config.targetGroupId, caption, imageBuffers);

    // 7. Atualizar o status da galeria no banco
    db.run("UPDATE galleries SET status = 'published' WHERE id = ?", [gallery.id]);
    logger.info(`Galeria (ID: ${gallery.id}) marcada como "published" no banco de dados.`);

  } catch (error) {
    logger.error('Ocorreu um erro catastrófico durante o processo de publicação.', error);
  } finally {
    // 8. Encerrar tudo
    logger.info('Fechando conexão com o WhatsApp...');
    await closeWhatsApp();
    db.close();
    logger.info('Conexão com o banco de dados local fechada.');
    logger.info('--- PROCESSO DE PUBLICAÇÃO FINALIZADO ---');
  }
}

publishApprovedEdition();