import makeWASocket, {
  useMultiFileAuthState,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import 'dotenv/config';

async function start() {
  const phoneNumber = process.env.PAIRING_PHONE_NUMBER;
  if (!phoneNumber) {
    console.error('A variável de ambiente PAIRING_PHONE_NUMBER não está definida.');
    return;
  }

  console.log('Iniciando teste de pareamento com armazenamento local...');
  // Limpar o diretório de teste anterior para garantir um início limpo
  const fs = await import('fs/promises');
  await fs.rm('./baileys_auth_test', { recursive: true, force: true });
  console.log('Diretório de autenticação de teste limpo.');

  const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth_test');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'debug' }),
    printQRInTerminal: false,
    browser: Browsers.windows('Desktop'),
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log('Conexão fechada, motivo:', reason);
    } else if (connection === 'open') {
      console.log('Conexão estabelecida com sucesso!');
    }
  });

  try {
    if (!sock.authState.creds.registered) {
      console.log('Sessão não registrada. Solicitando código de pareamento...');
      const code = await sock.requestPairingCode(phoneNumber);
      console.log('================================================');
      console.log('   CÓDIGO DE PAREAMENTO GERADO COM SUCESSO:');
      console.log(`   ${code}`);
      console.log('================================================');
    } else {
      console.log('Sessão já registrada.');
    }
  } catch (error) {
    console.error('FALHA AO SOLICITAR CÓDIGO DE PAREAMENTO:', error);
  }
}

start();
