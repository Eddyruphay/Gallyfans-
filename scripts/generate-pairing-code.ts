import makeWASocket, {
  fetchLatestBaileysVersion,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';

// Helper para o delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function pairWithKnightbotConfig() {
  const phoneNumber = process.argv[2];
  if (!phoneNumber) {
    console.error("❌ Forneça o número de telefone como argumento.");
    console.log("Uso: npx ts-node scripts/generate-pairing-code.mts <SEU_NUMERO_DE_TELEFONE>");
    process.exit(1);
  }

  console.log(`Iniciando conexão para o número: ${phoneNumber}...`);
  console.log("Usando armazenamento de sessão local e configuração do Knightbot-MD (versão event-driven)...");

  const logger = pino({ level: 'silent' });
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_local');
  
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "20.0.04"], // <--- Configuração do Knightbot
    auth: { // <--- Estrutura de autenticação do Knightbot
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false, // <--- Configuração importante do Knightbot
    connectTimeoutMs: 60000, // <--- AUMENTANDO O TIMEOUT
  });

  // Flag para garantir que o código seja pedido apenas uma vez
  let pairingCodeRequested = false;

  // Listener de credenciais
  sock.ev.on('creds.update', saveCreds);

  // Listener de conexão com a lógica de pareamento corrigida
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    console.log(`[CONEXÃO] Status: ${connection}`);

    if (connection === 'open') {
      console.log('✅ Conexão aberta.');
      
      // Lógica de pareamento movida para o local correto
      if (!sock.authState.creds.registered && !pairingCodeRequested) {
        pairingCodeRequested = true;
        console.log("ℹ️ Sessão não registrada. Solicitando código de pareamento AGORA...");
        try {
          const code = await sock.requestPairingCode(phoneNumber);
          console.log("\n===================================");
          console.log("✅ CÓDIGO DE PAREAMENTO GERADO:");
          console.log(`\n    ${code.match(/.{1,4}/g)?.join('-') || code}\n`);
          console.log("===================================");
          console.log("\nUse este código no seu celular para conectar.");
          console.log("Aguardando a finalização da conexão...");
        } catch (error) {
          console.error("❌ Falha ao solicitar o código de pareamento:", error);
          process.exit(1);
        }
      } else if (sock.authState.creds.registered) {
        console.log("✅ Sessão já registrada e conectada. Pode fechar o script (Ctrl+C).");
      }
    }
    
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.error(`🔌 Conexão fechada! Razão: ${DisconnectReason[reason] || 'Desconhecida'} (${reason})`);
      
      if (reason !== DisconnectReason.loggedOut) {
        console.log("O script será encerrado. Tente rodar novamente.");
        process.exit(1); // Encerra em caso de falha para evitar loops infinitos
      } else {
        console.error("‼️ CONTA DESLOGADA. Apague a pasta 'baileys_auth_local' e tente parear novamente.");
        process.exit(1);
      }
    }
  });

  if (sock.authState.creds.registered) {
    console.log("✅ Sessão já registrada encontrada. Tentando conectar...");
  }
}

pairWithKnightbotConfig().catch(err => {
  console.error("❌ Ocorreu um erro inesperado:", err);
  process.exit(1);
});

