import axios from 'axios';
import logger from './logger.js';
import { config } from './config.js';

/**
 * Atualiza a variável de ambiente WA_SESSION_BASE64 no serviço do Render.
 * @param sessionBase64 A nova string de sessão codificada em Base64.
 */
export async function updateWaSessionOnRender(sessionBase64: string): Promise<void> {
  if (!config.renderApiKey || !config.renderServiceId) {
    logger.warn('[RENDER_API] RENDER_API_KEY ou RENDER_SERVICE_ID não configurados. Pulando a auto-atualização da sessão.');
    return;
  }

  if (!sessionBase64) {
    logger.error('[RENDER_API] A string da sessão em Base64 é obrigatória para a atualização.');
    return;
  }

  logger.info(`[RENDER_API] Iniciando a auto-atualização da variável de ambiente WA_SESSION_BASE64 para o serviço: ${config.renderServiceId}`);

  const url = `https://api.render.com/v1/services/${config.renderServiceId}/env-vars`;
  
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${config.renderApiKey}`,
    'Content-Type': 'application/json',
  };

  // O Render espera um array de variáveis. Mesmo que seja só uma.
  const payload = [{
    key: 'WA_SESSION_BASE64',
    value: sessionBase64,
  }];

  try {
    // No Render, para atualizar uma variável, você envia o corpo inteiro de variáveis.
    // A API de "patch" (PUT) substitui as variáveis existentes com o mesmo nome.
    await axios.put(url, payload, { headers });
    logger.info('[RENDER_API] ✅ Variável de ambiente WA_SESSION_BASE64 atualizada com sucesso no Render!');
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      logger.error({ 
        status: error.response?.status,
        data: error.response?.data,
      }, '[RENDER_API] Falha na chamada da API do Render para atualizar a sessão.');
    } else {
      logger.error({ error }, '[RENDER_API] Ocorreu um erro inesperado ao tentar atualizar a sessão no Render.');
    }
    // Não lançamos o erro para não quebrar o fluxo principal do worker
  }
}
