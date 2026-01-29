import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const CHANNELS_FILE_PATH = path.join(process.cwd(), 'channels.json');
const HARVEST_SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'harvest.mts');
const OUTPUT_DIR = path.join(process.cwd(), 'harvested_data');

async function main() {
  console.log('🚀 Iniciando processo de colheita em lote...');

  // 1. Ler a lista de canais do arquivo JSON
  let channels: string[];
  try {
    const fileContent = await fs.readFile(CHANNELS_FILE_PATH, 'utf-8');
    channels = JSON.parse(fileContent);
    console.log(`📢 Canais a serem processados: ${channels.join(', ')}`);
  } catch (error) {
    console.error(`❌ Erro ao ler o arquivo de canais em ${CHANNELS_FILE_PATH}`, error);
    process.exit(1);
  }

  // 2. Iterar e executar a colheita para cada canal
  for (const channel of channels) {
    console.log(`
--- Processando canal: ${channel} ---`);
    const command = `npx tsx ${HARVEST_SCRIPT_PATH} ${channel}`;
    const outputFilePath = path.join(OUTPUT_DIR, `${channel}.json`);

    try {
      // Executa o script de colheita
      const { stdout, stderr } = await execPromise(command);

      // stderr do script de colheita contém os logs de progresso
      if (stderr) {
        console.error(stderr.trim());
      }

      // stdout contém o JSON limpo
      if (stdout) {
        await fs.writeFile(outputFilePath, stdout, 'utf-8');
        console.log(`✔️  Sucesso! Dados salvos em: ${outputFilePath}`);
      } else {
        console.warn(`⚠️  Aviso: O script para o canal "${channel}" não retornou dados.`);
      }

    } catch (error) {
      console.error(`❌ Erro ao processar o canal "${channel}"`, error);
    }
  }

  console.log('\n✨ Processo de colheita em lote concluído.');
}

main();
