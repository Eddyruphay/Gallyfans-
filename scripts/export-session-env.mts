import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_PREFIX = 'WA_SESSION_';

/**
 * Converte um nome de arquivo para um nome de variável de ambiente válido.
 * Ex: 'creds.json' -> 'WA_SESSION_CREDS_JSON'
 * @param fileName O nome do arquivo.
 * @returns O nome da variável de ambiente.
 */
function fileNameToEnvVar(fileName: string): string {
  const sanitized = fileName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return `${ENV_PREFIX}${sanitized}`;
}

async function exportSessionToEnv() {
  const sessionDirName = process.argv[2];
  if (!sessionDirName) {
    console.error('❌ Erro: Forneça o nome do diretório da sessão como argumento.');
    console.error('   Exemplo: npx tsx scripts/export-session-env.mts baileys_auth_local');
    process.exit(1);
  }

  const sessionPath = path.resolve(__dirname, '..', sessionDirName);
  console.log(`🔍 Lendo o diretório da sessão em: ${sessionPath}\n`);

  try {
    const files = await fs.readdir(sessionPath);
    let envFileContent = `# Cole o conteúdo abaixo no seu 'Environment Group' no Render ou em um arquivo .env\n\n`;
    let fileCount = 0;

    for (const file of files) {
      // Processa qualquer arquivo, não apenas .json
      const filePath = path.join(sessionPath, file);
      const stat = await fs.stat(filePath);

      if (stat.isFile()) {
        console.log(`  - Processando arquivo: ${file}`);
        const fileContent = await fs.readFile(filePath);
        const base64Content = fileContent.toString('base64');
        const envVarName = fileNameToEnvVar(file);
        
        envFileContent += `${envVarName}="${base64Content}"\n`;
        fileCount++;
      }
    }

    if (fileCount === 0) {
      console.error('❌ Nenhum arquivo encontrado no diretório especificado.');
      process.exit(1);
    }

    console.log('\n✅ Sessão exportada com sucesso!');
    console.log('👇 Copie todo o bloco de texto abaixo e cole nas suas variáveis de ambiente no Render.\n');
    console.log('--- INÍCIO DAS VARIÁVEIS DE AMBIENTE ---');
    console.log(envFileContent.trim());
    console.log('--- FIM DAS VARIÁVEIS DE AMBIENTE ---\n');

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Erro: O diretório '${sessionPath}' não foi encontrado.`);
    } else {
      console.error('❌ Ocorreu um erro ao exportar a sessão:', error);
    }
    process.exit(1);
  }
}

exportSessionToEnv();
