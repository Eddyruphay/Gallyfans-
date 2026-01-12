
import makeWASocket,
{
  useMultiFileAuthState,
  DisconnectReason,
  getDevice,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { exit } from 'process';

const logger = pino({ level: 'info' });

const SESSION_DIR = './gallyfans_session';
const GROUP_ID = '120363404510855649@g.us'; // Grupo 4Reels

/**
 * Este script "aquece" uma sessão local existente.
 * 1. Conecta-se usando a sessão da pasta 'gallyfans_session'.
 * 2. Envia uma mensagem de texto de teste para o grupo.
 * 3. Garante que as credenciais atualizadas sejam salvas pela função saveCreds.
 * 4. Encerra, deixando a pasta da sessão intacta para inspeção.
 */
async function warmUpSession() {
  logger.info(`Iniciando aquecimento da sessão da pasta: ${SESSION_DIR}`);

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Gallyfans', 'Aquecimento', '1.0'],
  });

  // O evento 'creds.update' é crucial. Ele salva a sessão atualizada.
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, receivedPendingNotifications } = update;

    if (connection === 'open') {
      logger.info('✅ Conexão estabelecida com sucesso!');
      logger.info(`📱 Dispositivo: ${getDevice(sock.user!.id)}`);
      logger.info(`👨‍💻 Usuário: ${sock.user!.id.split(':')[0]}`);
      
      // Aguarda o recebimento das notificações pendentes para garantir que o bot está "pronto"
      if(receivedPendingNotifications) {
        logger.info('Sincronização inicial concluída. Enviando mensagem de teste...');
        try {
          const testMessage = `Gallyfans Engine aqui! 🤖\nSessão local aquecida e testada com sucesso em: ${new Date().toLocaleString('pt-BR')}`;
          await sock.sendMessage(GROUP_ID, { text: testMessage });
          logger.info(`🎉 Mensagem de teste enviada para o grupo ${GROUP_ID}.`);

          logger.info('Aguardando 5 segundos para garantir que o evento "creds.update" seja processado...');
          await new Promise(resolve => setTimeout(resolve, 5000));

        } catch (err) {
          logger.error({ err }, '❌ Falha ao enviar a mensagem de teste.');
        } finally {
          logger.info('Missão de aquecimento cumprida. Encerrando conexão.');
          sock.end(undefined);
          exit(0);
        }
      }
    } else if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      logger.error(`🔌 Conexão fechada. Razão: ${statusCode} (${DisconnectReason[statusCode as number] || 'Desconhecida'})`);
      
      if (statusCode === DisconnectReason.loggedOut) {
        logger.fatal('‼️ A SESSÃO FOI DESLOGADA. Apague a pasta "gallyfans_session" e gere uma nova sessão do zero.');
      } else {
        logger.warn('A sessão pode ser inválida ou a conexão falhou. Tente novamente.');
      }
      exit(1);
    }
  });

  logger.info('Aguardando evento de conexão...');
}

warmUpSession().catch((err) => {
  logger.fatal({ err }, 'Ocorreu um erro fatal no script de aquecimento.');
  process.exit(1);
});
