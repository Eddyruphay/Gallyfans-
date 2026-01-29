import axios from 'axios';
import * as cheerio from 'cheerio';

const CHANNELS_LIST_URL = 'https://www.pornpics.com/channels/list/';

interface ChannelInfo {
  name: string;
  slug: string;
  url: string;
}

async function fetchChannelList(): Promise<void> {
  console.error(`📡 Buscando lista de canais em: ${CHANNELS_LIST_URL}`); // Log para stderr
  try {
    const response = await axios.get(CHANNELS_LIST_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
      }
    });
    const html = response.data;
    const $ = cheerio.load(html);
    const channels: ChannelInfo[] = [];

    $('div.list-item a').each((i, el) => {
      const href = $(el).attr('href');
      const name = $(el).attr('title');
      
      if (href && name) {
        const hrefParts = href.split('/').filter(part => part !== '');
        // Esperado: ['channels', 'channel-slug']
        if (hrefParts.length === 2 && hrefParts[0] === 'channels') {
          const slug = hrefParts[1];
          channels.push({
            name: name,
            slug: slug,
            url: `https://www.pornpics.com${href}`
          });
        }
      }
    });

    if (channels.length === 0) {
      throw new Error('Nenhum canal encontrado. O seletor "div.list-item a" pode ter mudado.');
    }

    console.error(`✅ ${channels.length} canais encontrados.`); // Log para stderr
    
    // Imprime o JSON final e limpo para stdout
    console.log(JSON.stringify(channels, null, 2));

  } catch (error) {
    console.error(`❌ Erro ao buscar a lista de canais: ${error.message}`);
    process.exit(1);
  }
}

fetchChannelList();
