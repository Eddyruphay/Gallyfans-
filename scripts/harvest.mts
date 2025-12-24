import axios from 'axios';
import * as cheerio from 'cheerio';
import retry from 'async-retry';

interface GalleryData {
  channel: string;
  originalId: string;
  title: string;
  url: string;
  thumbnailUrl: string;
}

async function main() {
  const channel = process.argv[2];
  if (!channel) {
    console.error('❌ Erro: Nome do canal é obrigatório.');
    console.log('Uso: npx tsx scripts/harvest.mts <nome-do-canal>');
    process.exit(1);
  }

  const url = `https://www.pornpics.com/channels/${channel}/`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.pornpics.com/channels/',
  };

  try {
    const harvestedData: GalleryData[] = await retry(async () => {
      console.error('🔎 Fetching URL:', url); // Log to stderr to not pollute stdout
      const response = await axios.get(url, { headers });
      const html = response.data;
      const $ = cheerio.load(html);

      const galleries: GalleryData[] = [];
      $('li.thumbwook a.rel-link').each((i, el) => {
        const link = $(el).attr('href');
        const img = $(el).find('img');
        const title = img.attr('alt');
        const thumbnailUrl = img.attr('src');
        // The link is a full URL like https://.../galleries/slug/
        // So the slug (which we use as originalId) is at index 4
        const originalId = link?.split('/')[4];

        if (title && originalId && link && thumbnailUrl) {
          galleries.push({
            channel: channel,
            originalId: originalId,
            title: title,
            url: link, // link is already a full URL
            thumbnailUrl: thumbnailUrl,
          });
        }
      });

      if (galleries.length === 0) {
        // This will cause a retry, which is fine. If it persists, it will throw.
        throw new Error('⚠️ Nenhuma galeria encontrada na página.');
      }
      
      console.error(`✔️ ${galleries.length} galerias encontradas.`); // Log to stderr
      return galleries;

    }, {
      retries: 2,
      onRetry: (error, attempt) => {
        console.error(`Tentativa ${attempt} falhou. Tentando novamente...`); // Log to stderr
      }
    });

    // The final, clean JSON output to stdout
    console.log(JSON.stringify(harvestedData, null, 2));

  } catch (error) {
    console.error('❌ Erro fatal durante a colheita:', error.message); // Log to stderr
    process.exit(1);
  }
}

main();
