import makeWASocket,
{
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';

// --- CONFIGURAÇÕES ---
const AUTH_FOLDER = 'baileys_auth_hello';
const SYNC_DURATION_SECONDS = 15;
// -------------------

const logger = pino({ level: 'silent' });

async function syncSession() {
  console.log(`Iniciando cliente Baileys para sincronizar a sessão...`);
  
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  
  if (!state.creds.registered) {
    console.error(`ERRO: Sessão de autenticação não encontrada em '${AUTH_FOLDER}'.`);
    process.exit(1);
  }

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('✅ Conectado com sucesso! Iniciando período de sincronização...');
      
      try {
        console.log(`Aguardando ${SYNC_DURATION_SECONDS} segundos para permitir a troca de chaves de criptografia...`);
        await new Promise(resolve => setTimeout(resolve, SYNC_DURATION_SECONDS * 1000));
        console.log('Período de sincronização concluído.');

      } catch (err) {
        console.error('❌ Erro durante o período de espera:', err);
      } finally {
        console.log('Encerrando conexão...');
        sock.end();
        process.exit(0);
      }
    } else if (connection === 'close') {
      // Não vamos reconectar neste script
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.error('❌ Conexão encerrada permanentemente (logout). Verifique suas credenciais.');
        process.exit(1);
      } else {
         // Para qualquer outro erro de fechamento, apenas saia.
         console.log(`Conexão encerrada. Status: ${statusCode || 'desconhecido'}`);
         process.exit(0);
      }
    }
  });
}

syncSession().catch(err => {
  console.error("❌ Erro inesperado durante a execução do script:", err);
  process.exit(1);
});
