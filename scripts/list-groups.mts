import makeWASocket,
{
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';

const logger = pino({ level: 'silent' });

async function listGroups() {
  console.log('Iniciando cliente Baileys para listar os grupos...');
  
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_temp');
  
  // Verifica se a sessão existe, senão, encerra.
  if (!state.creds.registered) {
    console.error('ERRO: Sessão de autenticação não encontrada.');
    console.error('Por favor, execute o script `get-group-id.mts` primeiro para autenticar.');
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
      console.log('✅ Conectado com sucesso! Buscando grupos...');
      
      try {
        const groups = await sock.groupFetchAllParticipating();
        console.log('\n================ LISTA DE GRUPOS ================');
        if (Object.keys(groups).length === 0) {
          console.log('O bot não está em nenhum grupo.');
        } else {
          for (const id in groups) {
            const group = groups[id];
            console.log(`- Nome: ${group.subject}`);
            console.log(`  ID: ${group.id}\n`);
          }
        }
        console.log('==================================================');
        console.log('\nCopie o ID do grupo desejado e atualize o segredo no Render.');
      } catch (err) {
        console.error('Falha ao buscar os grupos:', err);
      } finally {
        // Encerra a conexão após listar
        sock.end();
        process.exit(0);
      }
    } else if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('Conexão perdida, tentando reconectar...');
        listGroups();
      } else {
        console.log('Conexão encerrada permanentemente (logout).');
        process.exit(0);
      }
    }
  });
}

listGroups().catch(console.error);
