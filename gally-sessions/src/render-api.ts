import axios from 'axios';
import logger from './logger.js';
import { config } from './config.js';

interface EnvVar {
  key: string;
  value: string;
}

/**
 * Atualiza as variáveis de ambiente da sessão no serviço do Render.
 * @param envVars Um array de objetos, cada um contendo a chave e o valor da variável de ambiente.
 */
export async function updateWaSessionOnRender(envVars: EnvVar[]): Promise<void> {
  if (!config.renderApiKey || !config.renderServiceId) {
    logger.warn('[RENDER_API] RENDER_API_KEY ou RENDER_SERVICE_ID não configurados. Pulando a auto-atualização da sessão.');
    return;
  }

  if (!envVars || envVars.length === 0) {
    logger.error('[RENDER_API] Nenhuma variável de ambiente fornecida para a atualização.');
    return;
  }

  logger.info(`[RENDER_API] Iniciando a auto-atualização de ${envVars.length} variáveis de ambiente para o serviço: ${config.renderServiceId}`);

  const url = `https://api.render.com/v1/services/${config.renderServiceId}/env-vars`;
  
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${config.renderApiKey}`,
    'Content-Type': 'application/json',
  };

  // O payload é o array de variáveis de ambiente.
  const payload = envVars;

  try {
    // A API de "patch" (PUT) do Render para env-vars substitui as variáveis existentes com o mesmo nome
    // e adiciona novas se não existirem.
    await axios.put(url, payload, { headers });
    logger.info('[RENDER_API] ✅ Variáveis de ambiente da sessão atualizadas com sucesso no Render!');
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      logger.error({ 
        status: error.response?.status,
        data: error.response?.data,
      }, '[RENDER_API] Falha na chamada da API do Render para atualizar a sessão.');
    } else {
      logger.error({ error }, '[RENDER_API] Ocorreu um erro inesperado ao tentar atualizar a sessão no Render.');
    }
    // Não lançamos o erro para não quebrar o fluxo principal.
  }
}
