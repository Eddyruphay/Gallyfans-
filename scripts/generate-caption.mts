// scripts/generate-caption.mts
import fs from 'fs/promises';
import path from 'path';
import initSqlJs from 'sql.js';

const DB_FILE = path.join(process.cwd(), 'curadoria.db');

async function getGalleryData(galleryId: number) {
  console.error(`Buscando dados para a galeria ID: ${galleryId}`);

  const SQL = await initSqlJs({ locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file) });
  const fileBuffer = await fs.readFile(DB_FILE);
  const db = new SQL.Database(fileBuffer);

  let galleryData = {};

  try {
    // Get gallery info
    const gallery = db.exec("SELECT title, channel_slug FROM galleries WHERE id = ?", [galleryId]);
    if (!gallery[0] || !gallery[0].values.length) {
        throw new Error(`Galeria com ID ${galleryId} não encontrada.`);
    }
    
    const modelsQuery = `
      SELECT m.name, m.bio FROM models m
      JOIN gallery_models gm ON m.id = gm.modelId
      WHERE gm.galleryId = ?
    `;
    const models = db.exec(modelsQuery, [galleryId]);

    const tagsQuery = `
      SELECT t.name FROM tags t
      JOIN gallery_tags gt ON t.id = gt.tagId
      WHERE gt.galleryId = ?
    `;
    const tags = db.exec(tagsQuery, [galleryId]);

    const categoriesQuery = `
      SELECT c.name FROM categories c
      JOIN gallery_categories gc ON c.id = gc.categoryId
      WHERE gc.galleryId = ?
    `;
    const categories = db.exec(categoriesQuery, [galleryId]);

    galleryData = {
      title: gallery[0].values[0][0],
      channel: gallery[0].values[0][1],
      models: models[0] ? models[0].values.map(row => ({ name: row[0], bio: row[1] })) : [],
      tags: tags[0] ? tags[0].values.flat() : [],
      categories: categories[0] ? categories[0].values.flat() : [],
    };

  } catch (error) {
    console.error("Erro ao buscar dados:", error);
  } finally {
    db.close();
  }

  // Output the data as a JSON string for the "creative brain"
  console.log(JSON.stringify(galleryData, null, 2));
}

const galleryId = parseInt(process.argv[2], 10);
if (isNaN(galleryId)) {
  console.error("Erro: ID da galeria inválido.");
  process.exit(1);
}
getGalleryData(galleryId);
