import makeWASocket, {
  useMultiFileAuthState,
  type GroupMetadata,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ level: 'silent' });

async function getGroupId() {
  console.log('Iniciando cliente Baileys com a arquitetura de transporte final...');

  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_temp');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: 60000, // Aumenta o timeout para 60 segundos
  });

  let pairingRequested = false;

  sock.ev.on('creds.update', saveCreds);

  // A implementação final, aguardando a prontidão do transporte
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    console.log(`[CONEXÃO] Status: ${connection}`);

    if (
      connection === 'connecting' &&
      !state.creds.registered &&
      !pairingRequested
    ) {
      pairingRequested = true;
      console.log('Estado "connecting" detectado. Aguardando ativamente o transporte WebSocket...');

      // ESPERA ATIVA PELO TRANSPORTE
      await new Promise<void>((resolve) => {
        const check = () => {
          // @ts-ignore - Acessando propriedade interna para o fix
          if (sock.ws && sock.ws.readyState === 1) {
            console.log('Transporte WebSocket está pronto (readyState === 1).');
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });

      console.log('Solicitando código de pareamento no momento exato...');
      const phoneNumber = process.argv[2];
      if (!phoneNumber) {
        console.error('❌ Nenhuma sessão encontrada. Forneça o número do BOT como argumento.');
        process.exit(1);
      }

      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('\n==============================');
        console.log(`🔐 Código de emparelhamento: ${code}`);
        console.log('==============================');
        console.log(
          'No WhatsApp: Aparelhos Conectados > Conectar um aparelho > Conectar com número'
        );
      } catch (err) {
        console.error('❌ Erro ao gerar código:', err);
        process.exit(1);
      }
    }

    if (connection === 'open') {
      console.log('\n--------------------------------------------------');
      console.log('✅ Conectado com sucesso! Cliente pronto.');
      console.log('Aguardando ser adicionado a um grupo para capturar o ID...');
      console.log('--------------------------------------------------');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`❌ Conexão encerrada. Razão: ${statusCode}.`);
      if (!shouldReconnect) {
        process.exit(0);
      }
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
      process.exit(0);
    }
  });

  console.log("Aguardando eventos de conexão...");
}

getGroupId().catch(console.error);

