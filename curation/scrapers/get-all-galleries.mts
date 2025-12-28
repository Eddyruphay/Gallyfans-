// curation/scrapers/get-all-galleries.mts
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Este script busca a lista completa de URLs de todas as galerias de um canal,
 * navegando por todas as páginas de paginação.
 * - Input: slug do canal (ex: 'vixen')
 * - Output: um array JSON contendo as URLs de todas as galerias.
 */
async function getAllGalleries(channelSlug: string) {
  if (!channelSlug) {
    console.error('Erro: O slug do canal é obrigatório.');
    process.exit(1);
  }

  const formattedSlug = channelSlug.toLowerCase().replace(/\s+/g, '-');
  const baseUrl = `https://www.pornpics.com/channels/${formattedSlug}/`;
  console.error(`Buscando galerias do canal: ${channelSlug} (slug formatado: ${formattedSlug})`);

  try {
    // Get the HTML of the first page to extract total gallery count
    console.error('Buscando na página principal para calcular o total de páginas...');
    const { data: firstPageHtml } = await axios.get(baseUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' }
    });

    const $ = cheerio.load(firstPageHtml);

    // Nova lógica de paginação: Calcular a partir do número total de galerias
    const totalGalleriesSelector = '.card-galleries-count';
    const galleriesCountText = $(totalGalleriesSelector).text().trim();
    const totalGalleries = parseInt(galleriesCountText.replace(/,/g, ''), 10);

    if (isNaN(totalGalleries) || totalGalleries === 0) {
      throw new Error('Não foi possível encontrar o número total de galerias.');
    }

    const galleriesPerPage = 32; // Baseado na variável P_MAX do HTML
    const totalPages = Math.ceil(totalGalleries / galleriesPerPage);
    
    console.error(`Total de galerias: ${totalGalleries}. Páginas a processar: ${totalPages}`);

    const allGalleryUrls: string[] = [];

    // Loop por todas as páginas
    for (let i = 1; i <= totalPages; i++) {
      // A página 1 é a URL base, as outras são /i/
      const pageUrl = i === 1 ? baseUrl : `${baseUrl}?page=${i}`;
      console.error(`Processando página ${i}... URL: ${pageUrl}`);
      
      const { data: pageHtml } = await axios.get(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' }
      });
      const $page = cheerio.load(pageHtml);

      $page('li.thumbwook a.rel-link').each((_, el) => {
        const galleryUrl = $page(el).attr('href');
        if (galleryUrl) {
          allGalleryUrls.push(galleryUrl);
        }
      });
    }

    console.error(`Total de URLs de galerias encontradas: ${allGalleryUrls.length}`);
    // Imprime o resultado final para stdout
    console.log(JSON.stringify(allGalleryUrls, null, 2));

  } catch (error) {
    console.error(`Erro ao buscar galerias para o canal "${channelSlug}":`, error.message);
    process.exit(1);
  }
}

const channelSlug = process.argv[2];
getAllGalleries(channelSlug);
