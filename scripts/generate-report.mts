import postgres from 'postgres';
import dotenv from 'dotenv';
import logger from '../src/logger.js';

// Força o carregamento síncrono das variáveis de ambiente
dotenv.config({ path: '.env' });

async function generateReport() {
  if (!process.env.DATABASE_URL) {
    logger.fatal('DATABASE_URL não encontrada no arquivo .env!');
    return;
  }

  logger.info('Conectando ao banco de dados Neon para gerar o relatório...');
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

  try {
    logger.info('Buscando dados...');

    const [
      modelsCount,
      galleriesCount,
      imagesCount,
      channelsCount,
      galleriesByStatus,
    ] = await Promise.all([
      sql`SELECT COUNT(*) FROM models`,
      sql`SELECT COUNT(*) FROM galleries`,
      sql`SELECT COUNT(*) FROM images`,
      sql`SELECT COUNT(*) FROM curated_channels`,
      sql`SELECT status, COUNT(*) as count FROM galleries GROUP BY status`,
    ]);

    const totalModels = modelsCount[0].count;
    const totalGalleries = galleriesCount[0].count;
    const totalImages = imagesCount[0].count;
    const totalChannels = channelsCount[0].count;

    logger.info('--- RELATÓRIO COMPLETO DO BANCO DE DADOS ---');
    console.log(''); // Linha em branco para espaçamento

    console.log(`📊 Canais Curados: ${totalChannels}`);
    console.log(`🎨 Modelos (Creators): ${totalModels}`);
    console.log(`🖼️ Galerias Totais: ${totalGalleries}`);
    console.log(`🏞️ Imagens Totais: ${totalImages}`);

    console.log(''); // Linha em branco
    console.log('--- Status das Galerias ---');

    if (galleriesByStatus.length > 0) {
      galleriesByStatus.forEach(status => {
        console.log(`  - ${status.status.padEnd(15)}: ${status.count}`);
      });
    } else {
      console.log('  Nenhuma galeria com status definido encontrada.');
    }
    
    console.log('');
    logger.info('--- FIM DO RELATÓRIO ---');

  } catch (error) {
    logger.error('Ocorreu um erro ao gerar o relatório:');
    console.error(error);
  } finally {
    await sql.end();
    logger.info('Conexão com o banco de dados fechada.');
  }
}

generateReport();
