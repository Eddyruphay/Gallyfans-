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
  let connectionStartTime = 0;
  
  const { state, saveCreds } = await useMultiFileAuthState('session');
  
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
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('QR code recebido, escaneie por favor.');
    }

    if (connection === 'open') {
      connectionStartTime = Date.now();
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
        console.log('\nBusca de grupos concluída. A sessão permanecerá ativa para monitoramento.');
      } catch (err) {
        console.error('Falha ao buscar os grupos:', err);
      } finally {
        // A conexão não será mais encerrada aqui para permitir o monitoramento de longa duração.
      }
    } else if (connection === 'close') {
      if (connectionStartTime > 0) {
        const durationInSeconds = (Date.now() - connectionStartTime) / 1000;
        console.log(`\n🔌 Sessão ficou ativa por ${durationInSeconds.toFixed(2)} segundos.`);
      }
      const boomError = lastDisconnect?.error as Boom;
      const statusCode = boomError?.output?.statusCode;
      console.log('Conexão fechada.', {
        statusCode,
        error: boomError?.message,
        shouldReconnect: statusCode !== DisconnectReason.loggedOut,
      });

      if (statusCode === DisconnectReason.loggedOut) {
        console.error('❌ CONEXÃO RECUSADA: Logout forçado. A sessão é inválida. Remova a pasta "session" e gere uma nova.');
        process.exit(1);
      } else {
        // Para um script de uso único, não queremos reconectar. Apenas encerramos.
        console.log('Processo finalizado.');
        process.exit(0);
      }
    }
  });
}

listGroups().catch(console.error);
