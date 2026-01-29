// scripts/run-caption-generator.mts
import fs from 'fs/promises';
import path from 'path';
import initSqlJs from 'sql.js';

const DB_FILE = path.join(process.cwd(), 'curadoria.db');

// Função para capitalizar palavras
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// --- Lógica de Geração de Legenda (Meu "Cérebro Criativo") ---
function createCaption(data: any): string {
    const { title, models, tags, categories } = data;
    const modelNames = models.map(m => m.name);

    // Estratégia 1: Se tivermos modelos conhecidos
    if (modelNames.length > 1) {
        return `Uma colaboração imperdível entre ${modelNames.join(' e ')}. Uma galeria que explora o tema de ${categories[0] || 'pura sedução'}.`;
    }
    if (modelNames.length === 1) {
        const model = modelNames[0];
        if ((categories.includes('Office') || tags.includes('Office'))) {
            return `No escritório, ${model} mostra quem está no comando. Uma perspectiva única e envolvente.`;
        }
        if (categories.includes('MILF') || categories.includes('Cougar')) {
            return `A experiente ${model} em um ensaio que exalta sua beleza e maturidade.`;
        }
        return `A deslumbrante ${model} em um ensaio solo sobre ${categories[0] || 'beleza'} e ${tags[0] || 'sedução'}.`;
    }

    // Estratégia 2: Fallback se não houver modelos
    const cleanTitle = title.split(' ').map(capitalize).join(' ');
    return `Uma galeria intensa explorando o tema de ${categories[0] || 'desejo'}. Descubra "${cleanTitle}".`;
}


async function generateAllCaptions() {
  console.log('--- INICIANDO GERAÇÃO DE LEGENDAS EM MASSA ---');
  const SQL = await initSqlJs({ locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file) });
  const fileBuffer = await fs.readFile(DB_FILE);
  const db = new SQL.Database(fileBuffer);

  try {
    const galleriesToCaption = db.exec("SELECT id FROM galleries WHERE status = 'scraped' AND curated_caption IS NULL");
    if (!galleriesToCaption[0] || !galleriesToCaption[0].values.length) {
        console.log('Nenhuma galeria nova para legendar. Processo concluído.');
        return;
    }
    const galleryIds = galleriesToCaption[0].values.map(row => row[0] as number);
    console.log(`${galleryIds.length} galerias para legendar...`);

    for (const id of galleryIds) {
        // Coletar todos os ingredientes
        const galleryRes = db.exec("SELECT title FROM galleries WHERE id = ?", [id]);
        const modelsRes = db.exec("SELECT m.name FROM models m JOIN gallery_models gm ON m.id = gm.modelId WHERE gm.galleryId = ?", [id]);
        const tagsRes = db.exec("SELECT t.name FROM tags t JOIN gallery_tags gt ON t.id = gt.tagId WHERE gt.galleryId = ?", [id]);
        const categoriesRes = db.exec("SELECT c.name FROM categories c JOIN gallery_categories gc ON c.id = gc.categoryId WHERE gc.galleryId = ?", [id]);

        const ingredients = {
            title: galleryRes[0].values[0][0],
            models: modelsRes[0] ? modelsRes[0].values.map(row => ({ name: row[0] })) : [],
            tags: tagsRes[0] ? tagsRes[0].values.flat() : [],
            categories: categoriesRes[0] ? categoriesRes[0].values.flat() : [],
        };

        // Gerar a legenda
        const newCaption = createCaption(ingredients);

        // Salvar no banco
        db.run("UPDATE galleries SET curated_caption = ? WHERE id = ?", [newCaption, id]);
        console.log(`ID ${id}: Legenda gerada -> "${newCaption}"`);
    }

    // Salvar o banco de dados com as novas legendas
    const data = db.export();
    await fs.writeFile(DB_FILE, data);
    console.log('--- GERAÇÃO DE LEGENDAS CONCLUÍDA ---');
    console.log('Banco de dados atualizado com sucesso.');

  } catch (error) {
    console.error("Ocorreu um erro durante a geração de legendas:", error);
  } finally {
    db.close();
  }
}

generateAllCaptions();
