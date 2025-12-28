import makeWASocket, {
  useMultiFileAuthState,
  type GroupMetadata,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';
import { Boom } from '@hapi/boom';

const logger = pino({ level: 'silent' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function getGroupId() {
  console.log('Iniciando cliente Baileys...');
  
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_temp');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'), // 1. Trocar o browser (essencial)
  });

  sock.ev.on('creds.update', saveCreds);

  // 3. Pedir o código logo após criar o socket (se necessário)
  if (!sock.authState.creds.registered) {
    try {
      const phoneNumber = await question(
        'Número do BOT (ex: 5511999998888): '
      );
      const code = await sock.requestPairingCode(phoneNumber);
      console.log('\n==============================');
      console.log(`🔐 Código de emparelhamento: ${code}`);
      console.log('==============================');
      console.log(
        'No WhatsApp: Aparelhos Conectados > Conectar um aparelho > Conectar com número'
      );
    } catch (err) {
      console.error('Erro ao gerar código:', err);
      sock.end(err);
      process.exit(1);
    }
  }

  // 4. Evento connection.update fica só para status
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('\n--------------------------------------------------');
      console.log('✅ Conectado com sucesso! O cliente está pronto.');
      console.log('1. Se ainda não o fez, crie um grupo no seu WhatsApp.');
      console.log('2. Adicione este número (o do bot) ao grupo.');
      console.log('Aguardando ser adicionado a um grupo...');
      console.log('--------------------------------------------------');
    } else if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('❌ Conexão encerrada. Motivo:', lastDisconnect?.error, '. Reconectando:', shouldReconnect);
      if (shouldReconnect) {
        getGroupId();
      } else {
        process.exit(0);
      }
    }
  });

  // Evento para capturar o ID do grupo
  sock.ev.on('groups.upsert', (groups: GroupMetadata[]) => {
    const group = groups[0];
    if (group.id) {
      console.log('\n==================================================');
      console.log('🎉 BOT ADICIONADO A UM GRUPO! 🎉');
      console.log(`Nome do Grupo: ${group.subject}`);
      console.log(`ID do Grupo: ${group.id}`);
      console.log('==================================================');
      console.log('\nCopie o "ID do Grupo" acima. Este é o valor que você precisa.');
      console.log('Você pode fechar este script agora (Ctrl+C).');
      
      sock.end();
      process.exit(0);
    }
  });
}

getGroupId().catch(console.error);
