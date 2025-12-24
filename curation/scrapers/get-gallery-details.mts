// curation/scrapers/get-gallery-details.mts
import axios from 'axios';
import * as cheerio from 'cheerio';

interface GalleryDetails {
  imageUrls: string[];
  models: { name: string; slug: string | undefined; }[];
  categories: string[];
  tags: string[];
  stats: {
    rating: string | null;
    views: string | null;
  };
  channel: string | null;
  comments: { author: string | null; text: string | null; }[];
}

async function getGalleryDetails(galleryUrl: string) {
  if (!galleryUrl) {
    console.error('Erro: A URL da galeria é obrigatória.');
    process.exit(1);
  }

  // Usar stderr para logs, para que stdout tenha apenas o JSON limpo
  console.error(`Buscando detalhes da galeria em: ${galleryUrl}`);

  try {
    const { data: html } = await axios.get(galleryUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
       }
    });

    const $ = cheerio.load(html);

    const details: GalleryDetails = {
      imageUrls: [],
      models: [],
      categories: [],
      tags: [],
      stats: { rating: null, views: null },
      channel: null,
      comments: [],
    };

    // 1. Extrair URLs das Imagens (alta resolução)
    $('ul#tiles > li.thumbwook > a.rel-link').each((_, el) => {
      const href = $(el).attr('href');
      if (href) details.imageUrls.push(href);
    });

    // 2. Extrair Modelos
    $('div.gallery-info__item:contains("Models:") div.gallery-info__content a').each((_, el) => {
      const name = $(el).text().trim();
      const slug = $(el).attr('href');
      if (name) details.models.push({ name, slug });
    });

    // 3. Extrair Categorias
    $('div.gallery-info__item:contains("Categories:") div.gallery-info__content a').each((_, el) => {
      const category = $(el).text().trim();
      if (category) details.categories.push(category);
    });

    // 4. Extrair Tags
    $('div.gallery-info__item:contains("Tags List:") div.gallery-info__content a').each((_, el) => {
      const tag = $(el).text().trim();
      if (tag) details.tags.push(tag);
    });

    // 5. Extrair Estatísticas
    details.stats.rating = $('span.info-rate span.rate-count').text().trim() || null;
    details.stats.views = $('span.info-views').text().trim().replace('Views: ', '') || null;
    
    // 6. Extrair Canal
    details.channel = $('div.gallery-info__item:contains("Channel:") a').first().text().trim() || null;

    // 7. Extrair Comentários (se houver)
    // Esta parte é um placeholder, pois a seção de comentários pode ser carregada dinamicamente.
    // Por enquanto, ele vai procurar por comentários já existentes no HTML.
    $('div.comments__container .comment').each((_, el) => {
        const author = $(el).find('.comment__author').text().trim() || null;
        const text = $(el).find('.comment__text').text().trim() || null;
        details.comments.push({ author, text });
    });


    // Imprime o objeto JSON final para stdout
    console.log(JSON.stringify(details, null, 2));

  } catch (error) {
    console.error(`Erro ao buscar detalhes para a galeria "${galleryUrl}":`, error);
    process.exit(1);
  }
}

// Recebe a URL da galeria como argumento da linha de comando
const galleryUrl = process.argv[2];
getGalleryDetails(galleryUrl);
