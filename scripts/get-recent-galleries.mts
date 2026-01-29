// scripts/get-recent-galleries.mts
import axios from 'axios';
import * as cheerio from 'cheerio';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const GET_GALLERY_DETAILS_SCRIPT = 'curation/scrapers/get-gallery-details.mts';
const HOME_PAGE_URL = 'https://www.pornpics.com/recent/';

interface RecentGallery {
  title: string | null;
  url: string;
  thumbnailUrl: string | null;
  details?: any; // Detalhes completos virão aqui
}

async function main() {
  console.error(`🔎 Buscando galerias recentes em: ${HOME_PAGE_URL}`);

  try {
    // 1. Buscar a página inicial
    const { data: html } = await axios.get(HOME_PAGE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.pornpics.com/recent/',
        'Cookie': 'ugeocode=MZ; ugeoregcode=Nampula; ppavnv=0; _cookieNoticeSettings=%7B%22performance%22%3Atrue%2C%22targeting%22%3Atrue%2C%22analytic%22%3Atrue%7D; pp_lang=en; _ga=GA1.2.1504952155.1769204730; _gid=GA1.2.1532526841.1769464818; _ga_C3SGE653L9=GS2.2.s1769566707$o1$g0$t1769566707$j60$l0$h0; _stats-ref=https%3A%2F%2Fwww.pornpics.com%2F; is_logged_3=%7B%22status%22%3A%22error%22%2C%22message%22%3A%22User%20not%20authorized%22%7D',
      },
    });

    const $ = cheerio.load(html);
    const recentGalleries: RecentGallery[] = [];

    // 2. Extrair as galerias da página
    $('ul#tiles li.thumbwook').each((_, el) => {
      const linkEl = $(el).find('a.rel-link');
      const galleryUrl = linkEl.attr('href');
      
      if (galleryUrl) {
        // Extrai o título do final da URL da galeria
        const urlParts = galleryUrl.split('/').filter(p => p);
        const slug = urlParts[urlParts.length - 1];
        const title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        const thumbnailUrl = $(el).find('img.lazy-load').attr('data-src') || null;
        
        recentGalleries.push({
          title,
          url: galleryUrl,
          thumbnailUrl,
        });
      }
    });

    if (recentGalleries.length === 0) {
      console.error('⚠️ Nenhuma galeria recente encontrada. A estrutura do site pode ter mudado.');
      return;
    }

    console.error(`✅ Encontradas ${recentGalleries.length} galerias recentes. Buscando detalhes...`);

    // 3. Para cada galeria, buscar os detalhes completos
    const detailedGalleries = [];
    for (const gallery of recentGalleries) {
      console.error(`   - Processando: ${gallery.title}`);
      try {
        const { stdout } = await execPromise(`npx tsx ${GET_GALLERY_DETAILS_SCRIPT} "${gallery.url}"`);
        const details = JSON.parse(stdout);
        gallery.details = details;
        detailedGalleries.push(gallery);
      } catch (error) {
        console.error(`     [ERRO] Falha ao buscar detalhes para ${gallery.url}:`, error.message);
        // Adiciona a galeria mesmo sem detalhes para não perder a referência
        detailedGalleries.push(gallery); 
      }
    }

    // 4. Imprimir o resultado final
    console.log(JSON.stringify(detailedGalleries, null, 2));
    console.error('✔️ Operação concluída.');

  } catch (error) {
    console.error('❌ Erro fatal ao buscar galerias recentes:', error);
    process.exit(1);
  }
}

main();
