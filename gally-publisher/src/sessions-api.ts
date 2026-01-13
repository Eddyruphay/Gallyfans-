import axios from 'axios';
import { config } from './config.js';
import logger from './logger.js';

/**
 * Envia um álbum para o serviço gally-sessions para ser publicado no WhatsApp.
 * @param jid O JID do destinatário.
 * @param caption A legenda para o álbum.
 * @param imageUrls Um array de URLs de imagem.
 */
export async function sendAlbumToSessions(jid: string, caption: string, imageUrls: string[]): Promise<void> {
  const url = `${config.gallySessionsApiUrl}/api/send-album`;
  logger.info({ url, jid }, 'Enviando solicitação de publicação de álbum para o gally-sessions...');

  try {
    const response = await axios.post(
      url,
      {
        jid,
        caption,
        imageUrls,
      },
      {
        headers: {
          'X-API-KEY': config.apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 200 && response.data.success) {
      logger.info({ jid }, '✅ Solicitação de publicação de álbum aceita pelo gally-sessions.');
    } else {
      logger.warn({ jid, status: response.status, data: response.data }, 'Resposta inesperada do gally-sessions.');
      throw new Error(`Resposta inesperada do gally-sessions: ${response.status}`);
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      logger.error(
        {
          err: error,
          status: error.response?.status,
          data: error.response?.data,
          jid,
        },
        'Falha ao enviar solicitação para o gally-sessions.'
      );
    } else {
      logger.error({ err: error, jid }, 'Ocorreu um erro inesperado ao se comunicar com o gally-sessions.');
    }
    // Lança o erro para que o chamador (publisher) possa tratá-lo (ex: marcar o job como 'failed').
    throw error;
  }
}
