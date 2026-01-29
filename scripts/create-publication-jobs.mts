
import postgres from 'postgres';
import 'dotenv/config';

const logger = {
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
};

/**
 * Script para criar jobs de publicação na tabela `published_items`.
 * Ele busca todas as galerias existentes que ainda não têm um job
 * e cria uma entrada para cada uma, enfileirando-as para o publisher.
 */
async function createPublicationJobs() {
  logger.info('[+] Iniciando a criação de jobs de publicação...');

  if (!process.env.DATABASE_URL) {
    logger.error('[!] FATAL: DATABASE_URL não encontrada nas variáveis de ambiente!');
    return;
  }

  const sql = postgres(process.env.DATABASE_URL, {
    ssl: 'require',
    max: 1,
  });

  try {
    logger.info('[+] Conectado ao Neon DB.');

    // Buscar todas as galerias com seus criadores e imagens
    const galleries = await sql`
      SELECT 
        g.id as "galleryId",
        g.title as "galleryTitle",
        c.name as "creatorName",
        (
          SELECT json_agg(i.image_url ORDER BY i.position) 
          FROM images i 
          WHERE i."galleryId" = g.id
        ) as images
      FROM galleries g
      JOIN creators c ON g."modelId" = c.id
      WHERE NOT EXISTS (
        SELECT 1 FROM published_items pi WHERE pi.gallery_id = g.id
      )
    `;

    if (galleries.length === 0) {
      logger.info('[-] Nenhuma galeria nova para enfileirar. Todos os jobs já existem.');
      return;
    }

    logger.info(`[+] ${galleries.length} galerias encontradas para criar jobs.`);

    // Preparar os dados para inserção na tabela published_items
    const jobsToInsert = galleries.map(gallery => ({
      // A editionVersionId não é estritamente necessária para o publisher atual,
      // mas mantemos para compatibilidade futura do schema.
      edition_version_id: 1, // Placeholder
      gallery_id: gallery.galleryId,
      creator_name: gallery.creatorName,
      gallery_title: gallery.galleryTitle,
      images: gallery.images || [], // Garante que o campo JSON não seja nulo
      status: 'pending', // O status inicial de todo novo job
    }));

    // Inserir os jobs em lote
    const result = await sql`
      INSERT INTO published_items ${sql(jobsToInsert, 
        'edition_version_id', 
        'gallery_id', 
        'creator_name', 
        'gallery_title', 
        'images', 
        'status'
      )}
    `;

    logger.info(`[+] ✅ ${result.count} novos jobs de publicação foram criados com sucesso!`);

  } catch (error) {
    logger.error('[!] ❌ Erro ao criar jobs de publicação:', error);
  } finally {
    await sql.end();
    logger.info('[+] Conexão com Neon DB fechada.');
  }
}

createPublicationJobs();
