
import initSqlJs from 'sql.js';
import fs from 'fs';
import postgres from 'postgres';
import 'dotenv/config';

// Replace logger with console for simplicity in this standalone script
const logger = {
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
  warn: (message: string, ...args: any[]) => console.warn(message, ...args),
};

/**
 * Helper function to execute a prepared statement with sql.js and return results
 * in a format similar to better-sqlite3.
 */
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

/**
 * Converte um slug (ex: 'some-name') para um nome capitalizado (ex: 'Some Name').
 */
const slugToName = (slug: string): string => {
  if (!slug) return '';
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

async function migrate() {
  logger.info('[ETL] Iniciando migração completa do SQLite (via sql.js) para o Neon DB...');

  // --- 1. CONEXÕES ---
  const fileBuffer = fs.readFileSync('curadoria.db');
  const SQL = await initSqlJs();
  const sqliteDb = new SQL.Database(fileBuffer);
  logger.info('[ETL] Banco de dados SQLite carregado em memória com sql.js.');
  
  if (!process.env.DATABASE_URL) {
    logger.error('[ETL] FATAL: DATABASE_URL não encontrada nas variáveis de ambiente!');
    return;
  }
  const neonSql = postgres(process.env.DATABASE_URL, {
    ssl: 'require',
    max: 1, // Conexão única para o script
    idle_timeout: 20,
  });

  try {
    // --- 2. TRANSAÇÃO ÚNICA ---
    await neonSql.begin(async sql => {
      logger.info('[ETL] Transação com Neon DB iniciada.');

      // --- 3. MIGRAÇÃO DE CANAIS -> CREATORS ---
      logger.info('[ETL] Migrando `curated_channels` para `creators`...');
      const channels = query(sqliteDb, 'SELECT slug, description FROM curated_channels');
      if (channels.length > 0) {
        const creatorsToInsert = channels.map(c => ({
          name: slugToName(c.slug),
          slug: c.slug,
          bio: c.description || '',
        }));
        const result = await sql`INSERT INTO creators ${sql(creatorsToInsert, 'name', 'slug', 'bio')} ON CONFLICT (slug) DO NOTHING`;
        logger.info(`[ETL] ${result.count} novos criadores inseridos.`);
      }
      const creators = await sql`SELECT id, slug FROM creators`;
      const creatorSlugToIdMap = new Map(creators.map(c => [c.slug, c.id]));
      logger.info(`[ETL] ${creatorSlugToIdMap.size} criadores mapeados.`);

      // --- 4. MIGRAÇÃO DE TAGS E CATEGORIAS ---
      logger.info('[ETL] Migrando `tags` e `categories`...');
      const tags = query(sqliteDb, 'SELECT name FROM tags');
      const categories = query(sqliteDb, 'SELECT name FROM categories');
      if (tags.length > 0) await sql`INSERT INTO tags ${sql(tags, 'name')} ON CONFLICT (name) DO NOTHING`;
      if (categories.length > 0) await sql`INSERT INTO categories ${sql(categories, 'name')} ON CONFLICT (name) DO NOTHING`;
      
      const neonTags = await sql`SELECT id, name FROM tags`;
      const neonCategories = await sql`SELECT id, name FROM categories`;
      const tagNameIdMap = new Map(neonTags.map(t => [t.name, t.id]));
      const categoryNameIdMap = new Map(neonCategories.map(c => [c.name, c.id]));
      logger.info(`[ETL] ${tagNameIdMap.size} tags e ${categoryNameIdMap.size} categorias mapeadas.`);

      // --- 5. MIGRAÇÃO DE GALERIAS APROVADAS ---
      logger.info("[ETL] Migrando galerias com status 'approved'...");
      const approvedGalleries = query(sqliteDb, `
        SELECT id, originalId, channel_slug, title, originalRating, originalViews 
        FROM galleries WHERE status = 'scraped'
      `);

      const galleriesToInsert = approvedGalleries.map(g => {
        const modelId = creatorSlugToIdMap.get(g.channel_slug);
        if (!modelId) return null;

        // Data Cleaning for integer fields
        const ratingStr = String(g.originalRating || '');
        const ratingInt = ratingStr ? parseInt(ratingStr.replace(/\D/g, ''), 10) : null;

        const viewsStr = String(g.originalViews || '');
        const viewsInt = viewsStr ? parseInt(viewsStr.replace(/\D/g, ''), 10) : null;

        return {
          modelId: modelId,
          originalId: g.originalId,
          title: g.title,
          channel: g.channel_slug,
          originalRating: isNaN(ratingInt) ? null : ratingInt,
          originalViews: isNaN(viewsInt) ? null : viewsInt,
        };
      }).filter(Boolean);

      if (galleriesToInsert.length > 0) {
        const result = await sql`INSERT INTO galleries ${sql(galleriesToInsert, 'modelId', 'originalId', 'title', 'channel', 'originalRating', 'originalViews')} ON CONFLICT ("modelId", "originalId") DO NOTHING`;
        logger.info(`[ETL] ${result.count} novas galerias inseridas.`);
      }
      
      // --- 6. MAPEAMENTO DE GALERIAS (OLD ID -> NEW ID) ---
      const neonGalleries = await sql`SELECT id, "originalId", "modelId" FROM galleries`;
      const galleryOldNewIdMap = new Map<number, number>();
      const neonGalleryMap = new Map(neonGalleries.map(g => [`${g.modelId}-${g.originalId}`, g.id]));
      approvedGalleries.forEach(oldGallery => {
        const modelId = creatorSlugToIdMap.get(oldGallery.channel_slug);
        if (modelId) {
          const newId = neonGalleryMap.get(`${modelId}-${oldGallery.originalId}`);
          if (newId) galleryOldNewIdMap.set(oldGallery.id, newId);
        }
      });
      logger.info(`[ETL] ${galleryOldNewIdMap.size} galerias mapeadas (SQLite ID -> Neon ID).`);

      // --- 7. MIGRAÇÃO DE IMAGENS ---
      const oldGalleryIds = [...galleryOldNewIdMap.keys()];
      if (oldGalleryIds.length > 0) {
        const images = query(sqliteDb, `SELECT galleryId, imageUrl, position FROM images WHERE galleryId IN (${oldGalleryIds.map(() => '?').join(',')})`, oldGalleryIds);
        const imagesToInsert = images.map(img => {
          const newGalleryId = galleryOldNewIdMap.get(img.galleryId);
          // Match the DB schema: imageUrl -> image_url
          return newGalleryId ? { galleryId: newGalleryId, image_url: img.imageUrl, position: img.position } : null;
        }).filter(Boolean);

        if (imagesToInsert.length > 0) {
          const result = await sql`INSERT INTO images ${sql(imagesToInsert, 'galleryId', 'image_url', 'position')} ON CONFLICT (image_url) DO NOTHING`;
          logger.info(`[ETL] ${result.count} novas imagens inseridas.`);
        }
      }

      // --- 8. MIGRAÇÃO DAS RELAÇÕES (GALLERY <-> TAGS/CATEGORIES) ---
      logger.info('[ETL] Migrando relações de tags e categorias...');
      const tagRelations = query(sqliteDb, `SELECT gt.galleryId, t.name FROM gallery_tags gt JOIN tags t ON gt.tagId = t.id WHERE gt.galleryId IN (${oldGalleryIds.map(() => '?').join(',')})`, oldGalleryIds);
      const categoryRelations = query(sqliteDb, `SELECT gc.galleryId, c.name FROM gallery_categories gc JOIN categories c ON gc.categoryId = c.id WHERE gc.galleryId IN (${oldGalleryIds.map(() => '?').join(',')})`, oldGalleryIds);

      const galleryTagsToInsert = tagRelations.map(r => {
        const galleryId = galleryOldNewIdMap.get(r.galleryId);
        const tagId = tagNameIdMap.get(r.name);
        return galleryId && tagId ? { galleryId, tagId } : null;
      }).filter(Boolean);

      const galleryCategoriesToInsert = categoryRelations.map(r => {
        const galleryId = galleryOldNewIdMap.get(r.galleryId);
        const categoryId = categoryNameIdMap.get(r.name);
        return galleryId && categoryId ? { galleryId, categoryId } : null;
      }).filter(Boolean);

      if (galleryTagsToInsert.length > 0) {
        const result = await sql`INSERT INTO gallery_tags ${sql(galleryTagsToInsert, 'galleryId', 'tagId')} ON CONFLICT DO NOTHING`;
        logger.info(`[ETL] ${result.count} relações gallery-tag inseridas.`);
      }
      if (galleryCategoriesToInsert.length > 0) {
        const result = await sql`INSERT INTO gallery_categories ${sql(galleryCategoriesToInsert, 'galleryId', 'categoryId')} ON CONFLICT DO NOTHING`;
        logger.info(`[ETL] ${result.count} relações gallery-category inseridas.`);
      }
    }); // Fim da transação

    logger.info('[ETL] ✅ Migração completa finalizada com sucesso!');

  } catch (error) {
    logger.error('[ETL] ❌ Erro catastrófico durante a migração. O rollback foi executado.', error);
  } finally {
    sqliteDb.close();
    await neonSql.end();
    logger.info('[ETL] Conexões com SQLite e Neon DB fechadas.');
  }
}

migrate().catch(err => {
  logger.error('Erro inesperado ao executar o script de migração.', err);
  process.exit(1);
});
