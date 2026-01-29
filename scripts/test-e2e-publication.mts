import path from 'path';
import fs from 'fs/promises';
import initSqlJs from 'sql.js';
import { downloadAndSend } from '../src/download.js';
import logger from '../src/logger.js';

const DB_PATH = path.resolve(process.cwd(), 'curadoria.db');
const TARGET_JID = process.env.TARGET_GROUP_ID || '120363404510855649@g.us';
const IMAGE_COUNT = 3;

// Função principal do teste
async function runEndToEndTest() {
  logger.info('🚀 Starting End-to-End Publication Test (using sql.js)...');

  try {
    // 1. Inicializar o sql.js
    const SQL = await initSqlJs({
      // Opcional: aponte para o local do arquivo .wasm se não estiver junto
    });

    // 2. Carregar o banco de dados da memória
    logger.info({ dbPath: DB_PATH }, '[DB] Loading database file into memory...');
    const fileBuffer = await fs.readFile(DB_PATH);
    const db = new SQL.Database(fileBuffer);
    logger.info('[DB] Database loaded successfully.');

    // 3. Buscar 3 imagens aleatórias
    const query = `
      SELECT imageUrl 
      FROM images 
      ORDER BY RANDOM() 
      LIMIT ${IMAGE_COUNT};
    `;
    logger.info('[DB] Querying for random images...');
    const results = db.exec(query);

    if (!results || results.length === 0 || results[0].values.length < IMAGE_COUNT) {
      throw new Error(`Could not retrieve ${IMAGE_COUNT} images from the database.`);
    }

    // O resultado do sql.js é um array de arrays
    const imageUrls = results[0].values.map(row => row[0] as string);
    logger.info({ count: imageUrls.length }, '[DB] Successfully retrieved image URLs.');

    // 4. Montar a legenda
    const caption = `🤖 Teste de Publicação E2E (sql.js)\n\n- Imagens: ${imageUrls.length}\n- Horário: ${new Date().toISOString()}`;

    // 5. Chamar o workflow completo de download e envio
    logger.info('[WORKFLOW] Handing off to downloadAndSend workflow...');
    await downloadAndSend(TARGET_JID, caption, imageUrls);

    logger.info('✅ End-to-End Publication Test Completed Successfully!');
  } catch (error) {
    logger.error({ err: error }, '❌ End-to-End Publication Test Failed.');
    process.exit(1);
  }
  // 'finally' não é necessário pois o db existe apenas na memória aqui
}

runEndToEndTest();
