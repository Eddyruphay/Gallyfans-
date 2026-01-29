import fs from 'fs';
import makeWASocket, {
  useMultiFileAuthState,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';

const logger = pino({ level: 'info' });

// O nome da pasta onde a sessão completa será salva.
const TARGET_SESSION_DIR = './baileys_auth_producao';

// O arquivo de sessão inicial que sabemos que funciona.
const AUTH_SESSION_FILE = 'whatsapp-session.json';

async function generateFullSession() {
  logger.info(`--- Fábrica de Sessões Iniciada ---`);
  logger.info(`Objetivo: Gerar uma sessão multi-arquivo completa em: ${TARGET_SESSION_DIR}`);

  // --- 1. Validar o arquivo de sessão inicial ---
  if (!fs.existsSync(AUTH_SESSION_FILE)) {
    logger.error(`❌ Arquivo de sessão inicial não encontrado: ${AUTH_SESSION_FILE}.`);
    logger.error('   Certifique-se que este arquivo está na raiz do projeto.');
    process.exit(1);
  }
  logger.info(`✅ Arquivo de sessão inicial '${AUTH_SESSION_FILE}' encontrado.`);

  // --- 2. Preparar o diretório de destino ---
  // Não limpamos o diretório, para permitir "aquecer" uma sessão existente.
  if (!fs.existsSync(TARGET_SESSION_DIR)) {
    fs.mkdirSync(TARGET_SESSION_DIR);
    logger.info(`Diretório de destino '${TARGET_SESSION_DIR}' criado.`);
  }
  // Copiamos o creds.json inicial para dar o pontapé de saída.
  // O Baileys irá então gerar os outros arquivos necessários.
  fs.copyFileSync(AUTH_SESSION_FILE, `${TARGET_SESSION_DIR}/creds.json`);
  logger.info(`'creds.json' copiado para o diretório de destino para iniciar a hidratação.`);


  // --- 3. Conectar ao WhatsApp ---
  const { state, saveCreds } = await useMultiFileAuthState(TARGET_SESSION_DIR);

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    auth: state,
  });

  // O saveCreds irá salvar TODOS os arquivos gerados pelo Baileys no nosso diretório de destino.
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      logger.info('✅ CONEXÃO ESTABELECIDA!');
      logger.info('A sessão multi-arquivo foi gerada/atualizada com sucesso.');
      logger.info(`Pode verificar a pasta '${TARGET_SESSION_DIR}' para ver todos os arquivos.`);
      logger.info('Pode encerrar este script com Ctrl+C a qualquer momento.');
      
      // Opcional: Enviar uma mensagem para confirmar que tudo está funcional.
      try {
        // Use um ID de grupo ou o seu próprio número no formato 'xxxxxxxxxxx@s.whatsapp.net'
        // const targetJid = 'YOUR_OWN_JID@s.whatsapp.net';
        // await sock.sendMessage(targetJid, { text: 'Fábrica de Sessões: Sessão gerada com sucesso!' });
        // logger.info(`Mensagem de teste enviada para ${targetJid}`);
      } catch (err) {
        logger.warn({ err }, 'Não foi possível enviar a mensagem de teste.');
      }

    } else if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('❌ SESSÃO DESLOGADA. O arquivo whatsapp-session.json é inválido. É necessário gerar um novo.');
      } else {
        logger.error(`Conexão fechada inesperadamente. Status: ${statusCode}. A tentar reconectar...`);
        // O Baileys tentará reconectar automaticamente.
      }
    }
  });

  logger.info('A aguardar pela conexão com o WhatsApp...');
}

generateFullSession().catch((err) => {
  logger.fatal({ err }, 'Ocorreu um erro fatal na fábrica de sessões.');
  process.exit(1);
});
