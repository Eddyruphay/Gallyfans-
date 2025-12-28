import makeWASocket, {
  useMultiFileAuthState,
  type GroupMetadata,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';

const logger = pino({ level: 'silent' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function getGroupId() {
  console.log('Iniciando cliente Baileys para obter o ID do Grupo...');
  
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_temp');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false, // Desabilitar QR Code
    browser: Browsers.macOS('Desktop'), // Usar um browser válido
  });

  sock.ev.on('creds.update', saveCreds);

  // Se a conexão já existir, não pedir o código
  if (!sock.authState.creds.registered) {
    const phoneNumber = await question(
      'Por favor, insira o número de telefone do BOT (formato: 5511999998888):\n'
    );
    try {
      const code = await sock.requestPairingCode(phoneNumber);
      console.log('--------------------------------------------------');
      console.log(`Seu código de emparelhamento é: ${code}`);
      console.log('--------------------------------------------------');
      console.log('Abra o WhatsApp no seu celular, vá para "Aparelhos Conectados" > "Conectar um aparelho" > "Conectar com número de telefone".');
    } catch (error) {
      console.error('Falha ao solicitar o código de emparelhamento:', error);
      process.exit(1);
    }
  }

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'open') {
      console.log('\n--------------------------------------------------');
      console.log('✅ Conexão aberta! O cliente está pronto.');
      console.log('1. Se ainda não o fez, crie um grupo no seu WhatsApp.');
      console.log('2. Adicione este número (o do bot) ao grupo.');
      console.log('Aguardando ser adicionado a um grupo...');
      console.log('--------------------------------------------------');
    }
    if (update.connection === 'close') {
      console.log('Conexão fechada.');
      process.exit(0);
    }
  });

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
      
      // Encerra o processo para não ficar rodando indefinidamente
      process.exit(0);
    }
  });

  // Mantém o script rodando
  await new Promise(() => {});
}

getGroupId().catch(console.error);