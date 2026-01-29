import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ level: 'info' });

async function generateSession() {
  logger.info('Iniciando processo de geração de sessão...');

  const { state, saveCreds } = await useMultiFileAuthState('session');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Chrome', 'Android', '143.0.0.0'],
  });

  let pairingCodeRequested = false; // Flag para garantir que o código seja solicitado apenas uma vez

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    logger.info({ connection }, 'Evento de conexão');

    // --- Lógica de Solicitação de Código de Pareamento ---
    if (
      connection === 'connecting' &&
      !state.creds.registered &&
      !pairingCodeRequested
    ) {
      pairingCodeRequested = true;
      logger.info('Conexão em andamento e sem credenciais registradas. Aguardando 2 segundos antes de solicitar código de pareamento...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Adiciona um atraso de 2 segundos
      logger.info('Solicitando código de pareamento...');
      const phoneNumber = '258835097404'; // Número de telefone do bot
      
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        logger.info(`
        ************************************************
        CÓDIGO DE EMPARELHAMENTO: ${code}
        ************************************************
        Por favor, insira este código no seu WhatsApp (Aparelhos Conectados > Conectar um aparelho > Conectar com número).
        `);
      } catch (error) {
        logger.error({ err: error }, 'Falha ao solicitar código de pareamento.');
        pairingCodeRequested = false; // Resetar a flag em caso de falha para permitir nova tentativa
      }
    }
    // --- Fim da Lógica de Solicitação de Código de Pareamento ---

    if (connection === 'open') {
      logger.info('✅ Conexão aberta! Sessão será salva em "session".');
      logger.info('Por favor, mantenha este processo rodando até que a conexão seja estabelecida no seu celular.');
      logger.info('Após o pareamento bem-sucedido, você pode fechar este processo manualmente (Ctrl+C).');
      // Não encerra o processo automaticamente aqui, espera pelo usuário ou por um evento de desconexão.
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      logger.error({ statusCode, error: lastDisconnect?.error }, '❌ Conexão encerrada.');
      
      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('Sessão inválida. Remova a pasta "session" e tente novamente.');
      }
      process.exit(1);
    }
  });
}

generateSession().catch(err => {
  logger.fatal({ err }, 'Erro fatal ao gerar sessão.');
  process.exit(1);
});
