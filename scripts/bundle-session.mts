import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bundleSession() {
  const sessionDirName = process.argv[2];
  if (!sessionDirName) {
    console.error('Erro: Forneça o nome do diretório da sessão como argumento.');
    console.error('Exemplo: npx tsx scripts/bundle-session.mts baileys_auth_local');
    process.exit(1);
  }

  const sessionPath = path.resolve(__dirname, '..', sessionDirName);
  console.log(`🔍 Lendo o diretório da sessão em: ${sessionPath}`);

  try {
    const files = await fs.readdir(sessionPath);
    const sessionData: { [key: string]: any } = {};

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(sessionPath, file);
        console.log(`  - Processando arquivo: ${file}`);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        sessionData[file] = JSON.parse(fileContent);
      }
    }

    if (Object.keys(sessionData).length === 0) {
      console.error('Nenhum arquivo .json encontrado no diretório especificado.');
      process.exit(1);
    }

    const bundledString = JSON.stringify(sessionData);
    const base64String = Buffer.from(bundledString).toString('base64');

    console.log('\n✅ Sessão empacotada com sucesso!');
    console.log('\nCopie a string Base64 abaixo e cole na sua variável de ambiente WA_SESSION_BASE64:\n');
    console.log('--- INÍCIO DA STRING DA SESSÃO ---');
    console.log(base64String);
    console.log('--- FIM DA STRING DA SESSÃO ---\n');

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`Erro: O diretório '${sessionPath}' não foi encontrado.`);
    } else {
      console.error('Ocorreu um erro ao empacotar a sessão:', error);
    }
    process.exit(1);
  }
}

bundleSession();
