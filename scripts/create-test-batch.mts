
import postgres from 'postgres';
import 'dotenv/config';

const logger = {
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
};

/**
 * Script para criar um lote de teste de jobs de publicação.
 * Ele busca 20 galerias, gera os metadados da legenda (Edição, By, Models)
 * e cria os jobs na tabela `published_items` com um payload JSON estruturado.
 */
async function createTestBatch() {
  logger.info('[+] Iniciando a criação do lote de teste de 20 jobs...');

  if (!process.env.DATABASE_URL || !process.env.TARGET_CHANNEL_ID) {
    logger.error('[!] FATAL: DATABASE_URL ou TARGET_CHANNEL_ID não encontrados nas variáveis de ambiente!');
    return;
  }

  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

  try {
    logger.info('[+] Conectado ao Neon DB.');

    // 1. Buscar 20 galerias que não foram publicadas, já calculando o "volume" e juntando os dados necessários
    const galleries = await sql`
      WITH NumberedGalleries AS (
        SELECT
          g.id,
          g.title,
          g.channel,
          c.name as creator_name, -- Nome do modelo/criador
          ROW_NUMBER() OVER(PARTITION BY g.channel ORDER BY g.id) as volume_number,
          (SELECT json_agg(t.name) FROM gallery_tags gt JOIN tags t ON gt."tagId" = t.id WHERE gt."galleryId" = g.id) as tags,
          (SELECT json_agg(c.name) FROM gallery_categories gc JOIN categories c ON gc."categoryId" = c.id WHERE gc."galleryId" = g.id) as categories,
          (SELECT json_agg(i.image_url ORDER BY i.position) FROM images i WHERE i."galleryId" = g.id) as images
        FROM galleries g
        JOIN creators c ON g."modelId" = c.id
        WHERE NOT EXISTS (
          SELECT 1 FROM published_items pi WHERE pi.gallery_id = g.id
        )
      )
      SELECT * FROM NumberedGalleries LIMIT 20;
    `;

    if (galleries.length === 0) {
      logger.info('[-] Nenhuma galeria nova para enfileirar. Todos os jobs já existem.');
      await sql.end();
      return;
    }

    logger.info(`[+] ${galleries.length} galerias encontradas para criar o lote de teste.`);

    // 2. Processar cada galeria para criar o payload do job
    const jobsToInsert = galleries.map(gallery => {
      // Lógica para o "By": pegar a categoria mais relevante ou a primeira tag.
      const byLine = gallery.categories?.[0] || gallery.tags?.[0] || 'Gally Fãs';

      const edition = `${gallery.channel} Vol. ${gallery.volume_number}`;

      const captionData = {
        edition: edition,
        by: byLine,
        models: gallery.creator_name ? [gallery.creator_name] : [],
      };

      const jobPayload = {
        imageUrls: gallery.images || [],
        captionData: captionData,
      };

      return {
        edition_version_id: 1, // Placeholder
        gallery_id: gallery.id,
        creator_name: gallery.creator_name || gallery.channel,
        gallery_title: gallery.title, // Título original
        images: jobPayload, // O objeto JSON completo
        status: 'pending',
        target_channel_id: process.env.TARGET_CHANNEL_ID, // ID do grupo para publicar
      };
    });

    // 3. Inserir os jobs em lote
    const result = await sql`
      INSERT INTO published_items ${sql(jobsToInsert, 
        'edition_version_id', 
        'gallery_id', 
        'creator_name', 
        'gallery_title', 
        'images', 
        'status',
        'target_channel_id'
      )}
    `;

    logger.info(`[+] ✅ ${result.count} novos jobs de teste foram criados com sucesso!`);

  } catch (error) {
    logger.error('[!] ❌ Erro ao criar o lote de teste:', error);
  } finally {
    await sql.end();
    logger.info('[+] Conexão com Neon DB fechada.');
  }
}

createTestBatch();
