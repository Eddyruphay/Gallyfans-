import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '../src/logger.js';
import { downloadImageAsBuffer } from '../src/download.js';

async function testDownloader() {
  logger.info('--- INICIANDO TESTE DE DOWNLOAD DE GALERIA COMPLETA ---');

  const dbPath = 'curadoria.db';

  // 1. Criar diretório temporário para a galeria
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gally-gallery-'));
  logger.info(`Diretório temporário criado: ${tempDir}`);

  // 2. Conectar ao banco local
  if (!fs.existsSync(dbPath)) {
    logger.fatal(`Banco de dados não encontrado em: ${dbPath}`);
    return;
  }

  const fileBuffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fileBuffer);
  logger.info('Conectado ao banco de dados local.');

  try {
    // 3. Buscar imagens de uma galeria (exemplo: primeira galeria encontrada)
    const galleryResult = db.exec(`
      SELECT galleryId FROM images LIMIT 1
    `);

    if (galleryResult.length === 0) {
      logger.error('Nenhuma galeria encontrada.');
      return;
    }

    const galleryId = galleryResult[0].values[0][0];
    logger.info(`Galeria selecionada: ${galleryId}`);

    const imagesResult = db.exec(`
      SELECT imageUrl FROM images WHERE galleryId = '${galleryId}'
    `);

    if (imagesResult.length === 0 || imagesResult[0].values.length === 0) {
      logger.error('Nenhuma imagem encontrada para esta galeria.');
      return;
    }

    const imageUrls = imagesResult[0].values.map(v => v[0] as string);
    logger.info(`Total de imagens na galeria: ${imageUrls.length}`);

    // 4. Métricas iniciais
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    let totalBytes = 0;

    // 5. Download sequencial (comportamento humano)
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      logger.info(`Baixando imagem ${i + 1}/${imageUrls.length}`);

      const buffer = await downloadImageAsBuffer(imageUrl);
      totalBytes += buffer.length;

      const filePath = path.join(
        tempDir,
        `image_${String(i + 1).padStart(2, '0')}.jpg`
      );

      fs.writeFileSync(filePath, buffer);
    }

    // 6. Métricas finais
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const durationMs = endTime - startTime;
    const memoryUsedMB = (endMemory - startMemory) / 1024 / 1024;
    const totalSizeMB = totalBytes / 1024 / 1024;

    // 7. Relatório
    logger.info('--- RELATÓRIO DE PROCESSAMENTO DA GALERIA ---');
    logger.info(`  Galeria ID: ${galleryId}`);
    logger.info(`  Imagens processadas: ${imageUrls.length}`);
    logger.info(`  Tamanho total: ${totalSizeMB.toFixed(2)} MB`);
    logger.info(`  Tempo total: ${(durationMs / 1000).toFixed(2)} s`);
    logger.info(`  Consumo de memória (heap): ${memoryUsedMB.toFixed(2)} MB`);
    logger.info(`  Diretório temporário: ${tempDir}`);
    logger.info('--------------------------------------------');

    logger.info('Galeria pronta para envio via WhatsApp (buffer em disco).');

  } catch (error) {
    logger.error('❌ Falha no processamento da galeria.', error);
  } finally {
    db.close();
    logger.info('--- TESTE FINALIZADO ---');
  }
}

testDownloader();
