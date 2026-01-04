import makeWASocket,
{
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

// --- CONFIGURAÇÕES ---
const GROUP_ID = '120363404510855649@g.us';
const MESSAGE = 'Hello Gally (Test from GitHub Actions)';
const AUTH_FOLDER = 'baileys_auth_hello';
const SEND_DELAY_SECONDS = 5;
// -------------------

async function sendTestMessage() {
  console.log(`Iniciando cliente Baileys para enviar mensagem de teste...`);
  
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  
  if (!state.creds.registered) {
    console.error(`ERRO: Sessão de autenticação não encontrada em '${AUTH_FOLDER}'.`);
    process.exit(1);
  }

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('✅ Conectado com sucesso! Enviando mensagem de teste...');
      
      try {
        await sock.sendMessage(GROUP_ID, { text: MESSAGE });
        console.log(`\n✅ Mensagem de teste enviada para o grupo ${GROUP_ID}`);
        
        console.log(`Aguardando ${SEND_DELAY_SECONDS} segundos antes de encerrar...`);
        await new Promise(resolve => setTimeout(resolve, SEND_DELAY_SECONDS * 1000));

      } catch (err) {
        console.error('❌ Falha ao enviar a mensagem:', err);
      } finally {
        console.log('Encerrando conexão...');
        sock.end();
        process.exit(0);
      }
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      console.error(`🔌 Conexão fechada com código: ${statusCode}. Encerrando.`);
      process.exit(1);
    }
  });
}

sendTestMessage().catch(err => {
  console.error("❌ Erro inesperado durante a execução do script:", err);
  process.exit(1);
});