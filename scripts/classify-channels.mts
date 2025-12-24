import { promises as fs } from 'fs';
import path from 'path';

const CHANNELS_FILE_PATH = path.join(process.cwd(), 'channels.json');

interface ChannelInfo {
  name: string;
  slug: string;
  url: string;
  categories?: string[];
}

// Regras de classificação: Categoria -> [palavras-chave]
const CLASSIFICATION_RULES: Record<string, string[]> = {
  'Anal': ['anal'],
  'Teen': ['teen', '18', 'young', 'eighteen', 'just-18', 'perfect-18'],
  'MILF': ['milf', 'mom', 'mommy', 'cougar', 'mature', 'older', 'aunt', 'grandma'],
  'Interracial': ['black', 'interracial', 'ebony', 'bbc'],
  'Lesbian': ['lesbian', 'girl-girl', 'dyked', 'lez'],
  'Hairy': ['hairy'],
  'POV': ['pov'],
  'Japanese': ['jav', 'japan', 'asian', 'nippon', 'tokyo'],
  'BDSM': ['bdsm', 'bound', 'bondage', 'hogtied', 'submission', 'submissive', 'sadistic', 'whipped', 'training-of-o'],
  'Fetish': ['fetish', 'foot', 'feet', 'latex', 'nylon', 'stocking', 'leather', 'heels', 'leg'],
  'Public': ['public', 'street', 'bus'],
  'Family': ['family', 'step', 'sis', 'bro', 'dad', 'daughter', 'mom', 'aunt'],
  'Big Tits': ['busty', 'boobs', 'tits', 'racks', 'melons', 'big-naturals', 'ddf-busty'],
  'Big Ass': ['ass', 'booty', 'pawg', 'big-wet-butts'],
  'Hentai': ['hentai', 'anime'],
  'AI': ['ai'],
  'Creampie': ['creampie', 'internal'],
  'Gangbang': ['gangbang'],
  'Orgy': ['orgy', 'party'],
  'Piss': ['piss', 'pissy'],
  'Squirt': ['squirt'],
  'Small Tits': ['small-tits', 'petite'],
  'Amateur': ['amateur', 'real', 'hometown'],
  'Casting': ['casting', 'audition'],
  'European': ['euro', 'czech', 'russian', 'hungarian', 'french', 'german', 'uk'],
  'Latina': ['latina', 'brazil', 'colombian', 'latino'],
  'Studio': ['vixen', 'blacked', 'tushy', 'deeper', 'slayed', 'brazzers', 'reality-kings', 'naughty-america', 'evil-angel', 'digital-playground']
};

async function classifyChannels() {
  console.log('🧐 Lendo e analisando channels.json...');

  let channels: ChannelInfo[];
  try {
    const fileContent = await fs.readFile(CHANNELS_FILE_PATH, 'utf-8');
    channels = JSON.parse(fileContent);
  } catch (error) {
    console.error(`❌ Erro ao ler o arquivo de canais em ${CHANNELS_FILE_PATH}`, error);
    process.exit(1);
  }

  const classifiedChannels = channels.map(channel => {
    const newCategories = new Set<string>();
    const searchableText = `${channel.name.toLowerCase()} ${channel.slug.toLowerCase()}`;

    for (const category in CLASSIFICATION_RULES) {
      const keywords = CLASSIFICATION_RULES[category];
      for (const keyword of keywords) {
        if (searchableText.includes(keyword)) {
          newCategories.add(category);
        }
      }
    }
    
    if (newCategories.size === 0) {
      newCategories.add('General');
    }

    return {
      ...channel,
      categories: Array.from(newCategories)
    };
  });

  try {
    await fs.writeFile(CHANNELS_FILE_PATH, JSON.stringify(classifiedChannels, null, 2), 'utf-8');
    console.log(`💾 Sucesso! Arquivo channels.json foi atualizado com ${classifiedChannels.length} canais categorizados.`);
  } catch (error) {
    console.error(`❌ Erro ao salvar o arquivo channels.json atualizado.`, error);
    process.exit(1);
  }
}

classifyChannels();
