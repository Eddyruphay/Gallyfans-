import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import logger from '../src/logger.js';

// Helper para simplificar a execução de queries e retornar um único valor
function getSingleValue(db: any, query: string): number {
  const result = db.exec(query);
  if (result.length > 0 && result[0].values.length > 0) {
    // Converte o valor para número, pois pode vir como string ou bigint
    return Number(result[0].values[0][0]);
  }
  return 0;
}

// Helper para queries que retornam múltiplas linhas (status)
function getGroupedValues(db: any, query: string): { status: string; count: number }[] {
  const results = [];
  const stmt = db.prepare(query);
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      status: String(row.status),
      count: Number(row.count),
    });
  }
  stmt.free();
  return results;
}

async function generateSqliteReport() {
  const dbPath = 'curadoria.db';
  if (!fs.existsSync(dbPath)) {
    logger.fatal(`Banco de dados SQLite não encontrado em: ${dbPath}`);
    return;
  }

  logger.info(`Lendo o banco de dados local '${dbPath}'...`);
  
  try {
    const fileBuffer = fs.readFileSync(dbPath);
    const SQL = await initSqlJs();
    const db = new SQL.Database(fileBuffer);

    logger.info('Banco de dados carregado. Gerando relatório...');

    const totalModels = getSingleValue(db, 'SELECT COUNT(*) FROM models');
    const totalGalleries = getSingleValue(db, 'SELECT COUNT(*) FROM galleries');
    const totalImages = getSingleValue(db, 'SELECT COUNT(*) FROM images');
    const totalChannels = getSingleValue(db, 'SELECT COUNT(*) FROM curated_channels');
    const galleriesByStatus = getGroupedValues(db, 'SELECT status, COUNT(*) as count FROM galleries GROUP BY status');

    logger.info('--- RELATÓRIO COMPLETO DO BANCO DE DADOS (curadoria.db) ---');
    console.log(''); // Linha em branco para espaçamento

    console.log(`📊 Canais Curados: ${totalChannels}`);
    console.log(`🎨 Modelos (Creators): ${totalModels}`);
    console.log(`🖼️ Galerias Totais: ${totalGalleries}`);
    console.log(`🏞️ Imagens Totais: ${totalImages}`);

    console.log(''); // Linha em branco
    console.log('--- Status das Galerias ---');

    if (galleriesByStatus.length > 0) {
      galleriesByStatus.forEach(item => {
        console.log(`  - ${item.status.padEnd(15)}: ${item.count}`);
      });
    } else {
      console.log('  Nenhuma galeria com status definido encontrada.');
    }
    
    console.log('');
    logger.info('--- FIM DO RELATÓRIO ---');

    db.close();

  } catch (error) {
    logger.error('Ocorreu um erro ao gerar o relatório do SQLite:', error);
  }
}

generateSqliteReport();
