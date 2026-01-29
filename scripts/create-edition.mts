
import { db } from './db.js';

// Simple slugify function to remove special characters and spaces
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-');        // Replace multiple - with single -
}

async function main() {
  const channelSlug = process.argv[2];

  if (!channelSlug) {
    console.error('❌ Erro: Por favor, forneça o slug do canal como argumento.');
    console.log('Uso: npx tsx scripts/create-edition.mts <channel-slug>');
    process.exit(1);
  }

  console.log(`🚀 Iniciando criação de edição para o canal: ${channelSlug}`);

  const { db: kysely, saveDb } = await db;

  try {
    await kysely.transaction().execute(async (trx) => {
      // 1. Buscar o nome do canal
      const channel = await trx
        .selectFrom('curated_channels')
        .select('description') // Using description as name for now
        .where('slug', '=', channelSlug)
        .executeTakeFirst();

      if (!channel || !channel.description) {
        throw new Error(`Canal com slug "${channelSlug}" não encontrado ou não possui nome.`);
      }
      const channelName = channel.description;
      console.log(`✅ Nome do canal encontrado: ${channelName}`);

      // 2. Determinar o próximo volume da edição
      const lastEdition = await trx
        .selectFrom('editions')
        .select('name')
        .where('name', 'like', `Edição ${channelName} - Vol. %`)
        .orderBy('name', 'desc')
        .executeTakeFirst();

      let nextVolume = 1;
      if (lastEdition) {
        const lastVolumeMatch = lastEdition.name.match(/Vol\. (\d+)/);
        if (lastVolumeMatch) {
          nextVolume = parseInt(lastVolumeMatch[1], 10) + 1;
        }
      }
      console.log(`📈 Próximo volume será: ${nextVolume}`);

      // 3. Criar a nova edição
      const editionName = `Edição ${channelName} - Vol. ${nextVolume}`;
      const editionSlug = slugify(editionName);

      const { insertId: editionId } = await trx
        .insertInto('editions')
        .values({
          name: editionName,
          slug: editionSlug,
          description: `Uma coleção de galerias do canal ${channelName}.`,
          status: 'draft',
          created_at: new Date().toISOString(),
        })
        .executeTakeFirstOrThrow();
      
      console.log(`✅ Nova edição criada: "${editionName}" (ID: ${editionId})`);

      // 4. Encontrar galerias aprovadas e não publicadas
      const approvedGalleries = await trx
        .selectFrom('galleries')
        .select('galleries.id')
        .leftJoin('edition_galleries', 'galleries.id', 'edition_galleries.galleryId')
        .where('galleries.channel_slug', '=', channelSlug)
        .where('galleries.status', '=', 'approved')
        .where('edition_galleries.galleryId', 'is', null)
        .execute();

      if (approvedGalleries.length === 0) {
        console.log('⚠️ Nenhuma nova galeria aprovada encontrada para adicionar a esta edição.');
        return; // Commits transaction
      }

      console.log(`➕ Encontradas ${approvedGalleries.length} galerias para adicionar à edição.`);

      // 5. Associar galerias à nova edição
      const editionGalleriesData = approvedGalleries.map(gallery => ({
        editionId: Number(editionId),
        galleryId: gallery.id,
      }));

      await trx
        .insertInto('edition_galleries')
        .values(editionGalleriesData)
        .execute();
        
      console.log(`✅ ${approvedGalleries.length} galerias associadas com sucesso.`);
    });

    // Se a transação for bem-sucedida, salvar o banco de dados no arquivo
    await saveDb();
    console.log('💾 Alterações salvas com sucesso no arquivo curadoria.db!');
    console.log('🎉 Processo de criação de edição concluído com sucesso!');

  } catch (error) {
    console.error('❌ Ocorreu um erro durante o processo:', error);
    process.exit(1);
  }
}

main();
