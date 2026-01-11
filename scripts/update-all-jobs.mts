
import postgres from 'postgres';
import 'dotenv/config';

const logger = {
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
  warn: (message: string, ...args: any[]) => console.warn(message, ...args),
};

/**
 * Script para ATUALIZAR todos os jobs de publicação existentes para o novo formato de payload JSON.
 */
async function updateAllJobs() {
  logger.info('[+] Iniciando a atualização de todos os jobs pendentes...');

  if (!process.env.DATABASE_URL) {
    logger.error('[!] FATAL: DATABASE_URL não encontrado nas variáveis de ambiente!');
    return;
  }

  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

  try {
    logger.info('[+] Conectado ao Neon DB.');

    // 1. Buscar todos os jobs pendentes que ainda não foram atualizados (verificando se o campo images é um array, que é o formato antigo)
    const pendingJobs = await sql`
      SELECT id, gallery_id 
      FROM published_items 
      WHERE status = 'pending' AND jsonb_typeof(images) = 'array'
    `;

    if (pendingJobs.length === 0) {
      logger.info('[-] Nenhum job no formato antigo para atualizar.');
      await sql.end();
      return;
    }

    logger.info(`[+] ${pendingJobs.length} jobs no formato antigo encontrados. Buscando dados para atualização...`);

    // 2. Buscar todos os dados necessários para essas galerias de uma vez
    const galleryIds = pendingJobs.map(job => job.gallery_id);
    const galleriesData = await sql`
      SELECT
        g.id,
        g.title,
        g.channel,
        c.name as creator_name,
        ROW_NUMBER() OVER(PARTITION BY g.channel ORDER BY g.id) as volume_number,
        (SELECT json_agg(t.name) FROM gallery_tags gt JOIN tags t ON gt."tagId" = t.id WHERE gt."galleryId" = g.id) as tags,
        (SELECT json_agg(cat.name) FROM gallery_categories gc JOIN categories cat ON gc."categoryId" = cat.id WHERE gc."galleryId" = g.id) as categories,
        (SELECT json_agg(i.image_url ORDER BY i.position) FROM images i WHERE i."galleryId" = g.id) as images
      FROM galleries g
      JOIN creators c ON g."modelId" = c.id
      WHERE g.id IN ${sql(galleryIds)}
    `;

    const galleryDataMap = new Map(galleriesData.map(g => [g.id, g]));
    let updatedCount = 0;

    // 3. Iniciar transação para fazer as atualizações
    await sql.begin(async (tx) => {
      logger.info(`[+] Iniciando transação para atualizar ${pendingJobs.length} jobs.`);
      for (const job of pendingJobs) {
        const gallery = galleryDataMap.get(job.gallery_id);

        if (!gallery) {
          logger.warn(`[!] Galeria com ID ${job.gallery_id} não encontrada. Pulando job ID ${job.id}.`);
          continue;
        }

        // Montar o novo payload
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

        // Atualizar o job específico
        await tx`
          UPDATE published_items
          SET images = ${sql.json(jobPayload)}
          WHERE id = ${job.id}
        `;
        updatedCount++;
      }
    });

    logger.info(`[+] ✅ Transação concluída. ${updatedCount} jobs foram atualizados para o novo formato.`);

  } catch (error) {
    logger.error('[!] ❌ Erro ao atualizar os jobs:', error);
  } finally {
    await sql.end();
    logger.info('[+] Conexão com Neon DB fechada.');
  }
}

updateAllJobs();
