import fs from 'fs';
import makeWASocket, {
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { exit } from 'process';

// Usamos um logger simples para não depender de outros arquivos do projeto.
const logger = pino({ level: 'info' });

/**
 * ESTE SCRIPT É A VERSÃO MAIS SIMPLES POSSÍVEL.
 * O número de telefone está diretamente no código.
 * Ele apaga a sessão antiga antes de cada execução.
 */
async function pareamentoSimples() {
  const authFolder = 'baileys_auth_local';

  // Limpa a pasta de sessão antiga para garantir um início limpo.
  if (fs.existsSync(authFolder)) {
    logger.info(`Limpando pasta de sessão antiga: ${authFolder}`);
    fs.rmSync(authFolder, { recursive: true, force: true });
  }

  // O número de telefone fornecido pelo usuário.
  const numeroDeTelefone = '258835097404';

  logger.info('================================================');
  logger.info('Iniciando Gerador de Sessão SIMPLES (com limpeza)');
  logger.info(`Número a ser pareado: ${numeroDeTelefone}`);
  logger.info('A sessão será salva na pasta "baileys_auth_local"');
  logger.info('================================================');

  // useMultiFileAuthState salva a sessão em arquivos JSON locais.
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['Gallyfans', 'Cliente', '1.0'],
  });

  // Salva as credenciais sempre que forem atualizadas.
  sock.ev.on('creds.update', saveCreds);

  // Lida com os eventos de conexão.
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      logger.info('🎉 Conexão aberta com sucesso! A sessão foi salva localmente.');
      logger.info('Você já pode fechar este script (Ctrl+C).');
    } else if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      logger.error(`Conexão fechada. Razão: ${statusCode}`);
      logger.info('O script será encerrado.');
      exit(1);
    }
  });

  logger.info('Solicitando código de pareamento...');
  try {
    const code = await sock.requestPairingCode(numeroDeTelefone);
    console.log('================================================');
    console.log('                                                ');
    console.log(`   Seu código de pareamento é: ${code}   `);
    console.log('                                                ');
    console.log('   Abra o WhatsApp no seu celular, vá em        ');
    console.log('   "Aparelhos conectados" -> "Conectar um aparelho"');
    console.log('   e selecione "Conectar com número de telefone". ');
    console.log('                                                ');
    console.log('================================================');
  } catch (error) {
    logger.error({ error }, 'Falha ao solicitar o código de pareamento.');
    exit(1);
  }
}

pareamentoSimples().catch((err) => {
  logger.fatal({ err }, 'Ocorreu um erro fatal no script.');
  process.exit(1);
});
