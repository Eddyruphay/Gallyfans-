// scripts/populate-channels.mts
import fs from 'fs/promises';
import path from 'path';
import initSqlJs from 'sql.js';

const ELITE_CHANNELS_FILE = path.join(process.cwd(), 'curation', 'elite-channels.json');
const DB_FILE = path.join(process.cwd(), 'curadoria.db');
const SCHEMA_FILE = path.join(process.cwd(), 'curation', 'schema.sql');

async function populateChannels() {
  console.log('Iniciando script para popular a tabela de canais com sql.js...');

  // Iniciar o sql.js
  const SQL = await initSqlJs({
    locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
  });

  // Ler o schema para garantir que as tabelas existam
  const schemaSql = await fs.readFile(SCHEMA_FILE, 'utf-8');
  
  // Criar um novo banco de dados em memória e executar o schema
  const db = new SQL.Database();
  db.exec(schemaSql);
  console.log('Schema do banco de dados aplicado em memória.');

  // Ler os canais de elite
  const channelsJson = await fs.readFile(ELITE_CHANNELS_FILE, 'utf-8');
  const channelSlugs: string[] = JSON.parse(channelsJson);

  // Preparar o statement para mais eficiência
  const stmt = db.prepare('INSERT OR IGNORE INTO curated_channels (slug) VALUES (?)');
  for (const slug of channelSlugs) {
    stmt.run([slug]);
  }
  stmt.free(); // Liberar o statement
  
  console.log(`Canais processados. Inserindo ${channelSlugs.length} canais de elite.`);

  // Salvar o banco de dados da memória para o arquivo
  const data = db.export();
  await fs.writeFile(DB_FILE, data);

  console.log(`Concluído. Banco de dados 'curadoria.db' foi criado/atualizado com os canais.`);
  db.close();
}

populateChannels().catch(err => {
  console.error("Ocorreu um erro:", err);
  process.exit(1);
});