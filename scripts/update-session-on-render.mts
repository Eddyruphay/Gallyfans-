import axios from 'axios';
import pino from 'pino';

const logger = pino({ level: 'info' });

const RENDER_API_KEY = 'rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc';
const SERVICE_ID = 'srv-d58eegbe5dus73dsek7g'; // ID do gallyfans-worker

/**
 * Atualiza a variável de ambiente WA_SESSION_BASE64 no Render usando Axios.
 */
async function updateSessionOnRender(sessionBase64: string) {
  if (!sessionBase64) {
    logger.error('A string da sessão em Base64 é obrigatória como argumento.');
    process.exit(1);
  }

  logger.info(`Iniciando a atualização da variável de ambiente WA_SESSION_BASE64 para o serviço: ${SERVICE_ID}`);

  const url = `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`;
  
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${RENDER_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const payload = [{
    key: 'WA_SESSION_BASE64',
    value: sessionBase64,
  }];

  try {
    const { data: response } = await axios.put(url, payload, { headers });
    
    logger.info({ response }, 'Resposta da API do Render recebida.');

    // Lógica de validação corrigida
    if (Array.isArray(response) && response.find(item => item.envVar && item.envVar.key === 'WA_SESSION_BASE64')) {
      logger.info('✅ Variável de ambiente WA_SESSION_BASE64 atualizada com sucesso no Render!');
    } else {
      logger.error({ response }, 'A resposta da API não confirmou a atualização da variável.');
      throw new Error('A atualização da variável de ambiente falhou.');
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      logger.error({ 
        status: error.response?.status,
        data: error.response?.data,
        headers: error.response?.headers 
      }, 'Falha na chamada da API do Render via Axios.');
    } else {
      logger.error({ error }, 'Ocorreu um erro inesperado.');
    }
    process.exit(1);
  }
}

const sessionString = process.argv[2];
updateSessionOnRender(sessionString);

