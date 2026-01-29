// scripts/run-full-scrape.mts
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import initSqlJs from 'sql.js';

const execPromise = promisify(exec);

// --- Configuração ---
const DB_FILE = path.join(process.cwd(), 'curadoria.db');
const SCRAPERS_DIR = path.join(process.cwd(), 'curation', 'scrapers');
const GET_ALL_GALLERIES_SCRIPT = path.join(SCRAPERS_DIR, 'get-all-galleries.mts');
const GET_GALLERY_DETAILS_SCRIPT = path.join(SCRAPERS_DIR, 'get-gallery-details.mts');
const CONCURRENCY_LIMIT = 5; // Processar 5 galerias em paralelo

// --- Funções do Banco de Dados ---
let db;

async function initializeDb() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
  });
  const fileBuffer = await fs.readFile(DB_FILE).catch(() => null);
  db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
}

async function saveDb() {
  const data = db.export();
  await fs.writeFile(DB_FILE, data);
}

// --- Lógica Principal ---

async function main() {
  console.log('--- INICIANDO OPERAÇÃO DE SCRAPING EM MASSA ---');
  await initializeDb();

  // 1. Buscar canais do banco
  const channels = db.exec("SELECT slug FROM curated_channels");
  if (!channels[0] || !channels[0].values) {
    console.error('Nenhum canal encontrado no banco de dados. Abortando.');
    return;
  }
  const channelSlugs = channels[0].values.flat();
  console.log(`[FASE 1] Encontrados ${channelSlugs.length} canais de elite para processar.`);

  // 2. Indexar todas as galerias de cada canal
  for (const slug of channelSlugs) {
    console.log(`\n[FASE 1] Indexando galerias para o canal: ${slug}`);
    try {
      const { stdout } = await execPromise(`npx tsx ${GET_ALL_GALLERIES_SCRIPT} "${slug}"`);
      const galleryUrls = JSON.parse(stdout);
      
      const stmt = db.prepare("INSERT OR IGNORE INTO galleries (originalId, channel_slug, title, status) VALUES (?, ?, ?, 'indexed')");
      let newCount = 0;
      for (const url of galleryUrls) {
        const urlParts = url.split('/').filter(Boolean);
        const originalId = urlParts.pop();
        const title = originalId.replace(/-/g, ' '); // Título placeholder
        stmt.run([originalId, slug, title]);
        if (db.getRowsModified() > 0) {
          newCount++;
        }
      }
      stmt.free();
      console.log(`[FASE 1] ${newCount} novas galerias indexadas para ${slug}. Total: ${galleryUrls.length}`);
    } catch (error) {
      console.error(`[ERRO] Falha ao indexar o canal ${slug}:`, error.message);
    }
  }
  await saveDb(); // Salvar progresso da indexação

  // 3. Buscar detalhes de todas as galerias indexadas
  console.log('\n[FASE 2] Iniciando extração de detalhes de todas as galerias indexadas...');
  const galleriesToIndex = db.exec("SELECT id, originalId, channel_slug FROM galleries WHERE status = 'indexed'");
  if (!galleriesToIndex[0] || !galleriesToIndex[0].values) {
    console.log('[FASE 2] Nenhuma galeria nova para detalhar. Operação concluída.');
    return;
  }
  
  const galleryQueue = galleriesToIndex[0].values.map(row => ({ id: row[0], originalId: row[1], channel: row[2] }));
  console.log(`[FASE 2] ${galleryQueue.length} galerias na fila para extração de detalhes.`);

  const processQueue = async () => {
    while (galleryQueue.length > 0) {
      const gallery = galleryQueue.shift();
      if (!gallery) continue;

      const galleryUrl = `https://www.pornpics.com/galleries/${gallery.originalId}/`;
      console.log(`[FASE 2] Processando galeria ID ${gallery.id} (${galleryQueue.length} restantes)`);

      try {
        const { stdout } = await execPromise(`npx tsx ${GET_GALLERY_DETAILS_SCRIPT} "${galleryUrl}"`);
        const details = JSON.parse(stdout);

        // --- Inserir dados no banco ---
        // Modelos
        for (const model of details.models) {
            db.run("INSERT OR IGNORE INTO models (name, slug) VALUES (?, ?)", [model.name, model.slug]);
            const modelId = db.exec("SELECT id FROM models WHERE name = ?", [model.name])[0].values[0][0];
            db.run("INSERT OR IGNORE INTO gallery_models (galleryId, modelId) VALUES (?, ?)", [gallery.id, modelId]);
        }
        // Tags
        for (const tagName of details.tags) {
            db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [tagName]);
            const tagId = db.exec("SELECT id FROM tags WHERE name = ?", [tagName])[0].values[0][0];
            db.run("INSERT OR IGNORE INTO gallery_tags (galleryId, tagId) VALUES (?, ?)", [gallery.id, tagId]);
        }
        // Categorias
        for (const catName of details.categories) {
            db.run("INSERT OR IGNORE INTO categories (name) VALUES (?)", [catName]);
            const catId = db.exec("SELECT id FROM categories WHERE name = ?", [catName])[0].values[0][0];
            db.run("INSERT OR IGNORE INTO gallery_categories (galleryId, categoryId) VALUES (?, ?)", [gallery.id, catId]);
        }
        // Imagens
        details.imageUrls.forEach((url, index) => {
            db.run("INSERT OR IGNORE INTO images (galleryId, imageUrl, position) VALUES (?, ?, ?)", [gallery.id, url, index + 1]);
        });
        // Atualizar galeria
        db.run("UPDATE galleries SET status = 'scraped', scraped_at = CURRENT_TIMESTAMP, originalRating = ?, originalViews = ? WHERE id = ?", [details.stats.rating, details.stats.views, gallery.id]);

      } catch (error) {
        console.error(`[ERRO] Falha ao processar galeria ID ${gallery.id}:`, error.message);
        db.run("UPDATE galleries SET status = 'failed' WHERE id = ?", [gallery.id]);
      }
    }
  };

  // Iniciar workers em paralelo
  const workers = Array(CONCURRENCY_LIMIT).fill(null).map(() => processQueue());
  await Promise.all(workers);

  console.log('\n[FASE 2] Extração de detalhes concluída.');
  await saveDb(); // Salvar progresso final

  console.log('\n--- OPERAÇÃO DE SCRAPING EM MASSA CONCLUÍDA ---');
}

main().catch(err => {
  console.error("Ocorreu um erro fatal no orquestrador:", err);
  db && saveDb(); // Tenta salvar o progresso em caso de erro fatal
  process.exit(1);
});
