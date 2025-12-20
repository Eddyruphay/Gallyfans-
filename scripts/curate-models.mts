import axios from 'axios';
import * as cheerio from 'cheerio';
import retry from 'async-retry';
import { PrismaClient } from '@prisma/client';
import { text } from 'stream/consumers';

const prisma = new PrismaClient();

async function main() {
  const channel = process.argv[2];
  if (!channel) {
    console.error('❌ Erro: Nome do canal é obrigatório.');
    console.log('Uso: npx tsx scripts/curate-models.mts <nome-do-canal>');
    process.exit(1);
  }

  console.log(`🌊 Iniciando colheita para o canal: ${channel}`);

  // 1. Garantir que o modelo para o canal exista
  const modelName = channel.charAt(0).toUpperCase() + channel.slice(1);
  const model = await prisma.model.upsert({
    where: { slug: channel },
    update: {},
    create: {
      name: modelName,
      slug: channel,
      sourceSite: 'pornpics',
    },
  });
  console.log(`✔️ Modelo "${model.name}" garantido com ID: ${model.id}`);

  const url = `https://www.pornpics.com/channels/${channel}/`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.pornpics.com/channels/',
  };

  try {
    await retry(async () => {
      console.log('🔎 Fetching URL:', url);
      const response = await axios.get(url, { headers });
      const html = response.data;
      const $ = cheerio.load(html);

      const galleryPromises = [];
      $('li.thumbwook a.rel-link').each((i, el) => {
        const link = $(el).attr('href');
        const img = $(el).find('img');
        const title = img.attr('alt');
        const originalId = link?.split('/')[2];

        if (title && originalId) {
          const galleryData = {
            modelId: model.id,
            originalId: originalId,
            title: title,
            channel: channel,
          };

          const promise = prisma.gallery.upsert({
            where: { modelId_originalId: { modelId: model.id, originalId: originalId } },
            update: { title: galleryData.title }, // Pode atualizar o título se ele mudar
            create: galleryData,
          });
          galleryPromises.push(promise);
        }
      });

      if (galleryPromises.length === 0) {
        console.warn('⚠️ Nenhuma galeria encontrada na página. Verifique o nome do canal ou a estrutura do site.');
        return;
      }

      console.log(`💾 Processando ${galleryPromises.length} galerias...`);
      const results = await Promise.all(galleryPromises);
      console.log(`✔️ ${results.length} galerias salvas com sucesso no banco de dados.`);

    }, {
      retries: 2,
      onRetry: (error, attempt) => {
        console.log(`Tentativa ${attempt} falhou. Tentando novamente...`);
      }
    });
  } catch (error) {
    console.error('❌ Erro fatal durante a colheita:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});