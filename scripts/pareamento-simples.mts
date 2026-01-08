import makeWASocket, {
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { exit } from 'process';
import { redis } from '../src/redis.js'; // Importa a instância do Redis
import { useCustomRedisAuthState } from '../src/redis-auth-store.js'; // Importa a nova função

const logger = pino({ level: 'info' });

async function pareamentoFinalComRedis() {
  const numeroDeTelefone = '258835097404';
  const GROUP_ID = '120363404510855649@g.us';

  logger.info('================================================');
  logger.info('Iniciando Pareamento Final com REDIS');
  logger.info(`Número a ser pareado: ${numeroDeTelefone}`);
  logger.info('A sessão será salva no Redis.');
  logger.info('================================================');

  const { state, saveCreds } = await useCustomRedisAuthState(redis);

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['Gallyfans', 'Cliente', '2.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  // Lida com os eventos de conexão.
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      logger.info('🎉 Conexão aberta com sucesso! A sessão foi salva no Redis.');
      logger.info('Enviando mensagem de teste...');
      try {
        const result = await sock.sendMessage(GROUP_ID, {
          text: 'Gallyfans está online! Sessão Redis funcional.',
        });
        logger.info({ msgId: result.key.id }, '✅ Mensagem de teste enviada com sucesso!');
        
        logger.info('Aguardando 5 segundos...');
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (err) {
        logger.error({ err }, '❌ Falha ao enviar mensagem de teste.');
      } finally {
        logger.info('Teste concluído. Encerrando.');
        sock.end(undefined);
        await redis.quit();
        exit(0);
      }
    } else if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      // Não fazemos nada aqui no close, apenas logamos. O processo de pareamento é feito fora.
      // Se a conexão fechar com um erro fatal (ex: loggedOut), o script irá falhar de qualquer forma.
      logger.warn(`Conexão fechada. Razão: ${statusCode}`);
    }
  });

  // Aguarda um pouco para o socket inicializar antes de pedir o código
  logger.info('Aguardando 3 segundos para inicializar o socket...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  logger.info('Solicitando código de pareamento...');
  try {
    const code = await sock.requestPairingCode(numeroDeTelefone);
    console.log('================================================');
    console.log('                                                ');
    console.log(`   Seu código de pareamento é: ${code}   `);
    console.log('                                                ');
    console.log('================================================');
  } catch (error) {
    logger.error({ error }, 'Falha ao solicitar o código de pareamento.');
    await redis.quit();
    exit(1);
  }
}

pareamentoFinalComRedis().catch(async (err) => {
  logger.fatal({ err }, 'Ocorreu um erro fatal no script.');
  await redis.quit();
  process.exit(1);
});
