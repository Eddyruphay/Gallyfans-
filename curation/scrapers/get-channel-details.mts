// curation/scrapers/get-channel-details.mts
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Este script busca os detalhes (bio/descrição) de um canal específico.
 * - Input: slug do canal (ex: 'vixen')
 * - Output: A descrição do canal em texto puro.
 */
async function getChannelDetails(channelSlug: string) {
  if (!channelSlug) {
    console.error('Erro: O slug do canal é obrigatório.');
    process.exit(1);
  }

  const url = `https://www.pornpics.com/channels/${channelSlug}/`;
  console.error(`Buscando detalhes do canal em: ${url}`); // Log para stderr

  try {
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
      },
    });

    const $ = cheerio.load(html);

    // TODO: Precisamos inspecionar a página para encontrar o seletor correto.
    // Tentativas comuns podem ser: '.channel-description', '.bio', '#about', '.profile-info p'
    const selector = 'div.card-desc__desc'; 
    const description = $(selector).text().trim();

    if (!description) {
      console.error(`Aviso: Nenhuma descrição encontrada para o canal "${channelSlug}" com o seletor "${selector}". A estrutura do site pode ter mudado.`);
    }

    // Imprime o resultado limpo para stdout
    console.log(description);

  } catch (error) {
    console.error(`Erro ao buscar detalhes para o canal "${channelSlug}":`, error.message);
    process.exit(1);
  }
}

// Pega o slug do canal a partir dos argumentos da linha de comando
const channelSlug = process.argv[2];
getChannelDetails(channelSlug);
