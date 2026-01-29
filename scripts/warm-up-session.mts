import makeWASocket,
{
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';

const WARMUP_DURATION_MINUTES = 5;
const ACTION_INTERVAL_SECONDS = 30;

const logger = pino({
  level: 'silent'
});

let sock: WASocket;
let warmupTimeout: NodeJS.Timeout;
let actionInterval: NodeJS.Timeout;

async function performWarmupActions() {
  if (!sock) return;

  try {
    console.log(`[${new Date().toLocaleTimeString()}] Executando ação de aquecimento: listando grupos...`);
    const groups = await sock.groupFetchAllParticipating();
    
    if (Object.keys(groups).length === 0) {
      console.log('> O bot não está em nenhum grupo.');
    } else {
      console.log(`> Encontrados ${Object.keys(groups).length} grupos:`);
      for (const id in groups) {
        const group = groups[id];
        // O Baileys pode não fornecer a lista de participantes diretamente no fetch all,
        // então contamos os que estão disponíveis.
        const memberCount = group.participants?.length || 'N/A';
        console.log(`  - "${group.subject}" (Membros: ${memberCount})`);
      }
    }
  } catch (err) {
    console.error('Falha ao executar ação de aquecimento:', err);
  }
}

async function warmUpSession() {
  console.log(`Iniciando cliente para aquecer a sessão por ${WARMUP_DURATION_MINUTES} minutos...`);
  
  const { state, saveCreds } = await useMultiFileAuthState('session');
  
  if (!state.creds.registered) {
    console.error('ERRO: Sessão de autenticação não encontrada em "session/creds.json".');
    process.exit(1);
  }

  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS('Chrome'),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('✅ Conectado com sucesso! Iniciando ciclo de aquecimento.');
      
      // Executa a primeira ação imediatamente
      await performWarmupActions();

      // Agenda ações repetidas
      actionInterval = setInterval(performWarmupActions, ACTION_INTERVAL_SECONDS * 1000);

      // Agenda o encerramento da sessão
      warmupTimeout = setTimeout(() => {
        console.log(`
[${new Date().toLocaleTimeString()}] Tempo de aquecimento de ${WARMUP_DURATION_MINUTES} minutos concluído.`);
        console.log('Encerrando a sessão de forma controlada...');
        clearInterval(actionInterval);
        sock.end(undefined);
      }, WARMUP_DURATION_MINUTES * 60 * 1000);

    } else if (connection === 'close') {
      console.log('\n🔌 Conexão fechada.');
      // Limpa os timers para evitar execuções pendentes
      clearTimeout(warmupTimeout);
      clearInterval(actionInterval);

      const boomError = lastDisconnect?.error as Boom;
      const statusCode = boomError?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        console.error('❌ CONEXÃO RECUSADA: Logout forçado. A sessão é inválida.');
        process.exit(1);
      } else {
        console.log('Processo de aquecimento finalizado.');
        process.exit(0);
      }
    }
  });
}

warmUpSession().catch(err => {
  console.error("Erro fatal durante o aquecimento da sessão:", err);
  process.exit(1);
});
