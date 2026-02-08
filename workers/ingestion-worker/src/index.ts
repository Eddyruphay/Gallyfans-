import { D1Database } from '@cloudflare/workers-types';
import Toucan from 'toucan-js';

interface Env {
  DB: D1Database;
  INGESTION_API_SECRET: string;
  SENTRY_DSN: string;
}

interface WhatsappEvent {
  id: string;
  event_id: string;
  group_id: string;
  sender_id?: string;
  event_type: string;
  event_timestamp: string;
  message_body?: string;
  quoted_message_id?: string;
  raw_payload: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const toucan = new Toucan({
      dsn: env.SENTRY_DSN,
      context: ctx,
      request: request,
    });

    try {
      console.log("Ingestion Worker: Iniciado");

      // 1. Verificar o método da requisição
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 2. Verificar o segredo de autenticação
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || authHeader !== `Bearer ${env.INGESTION_API_SECRET}`) {
        toucan.addBreadcrumb({
          message: 'Tentativa de acesso não autorizado.',
          level: 'warning',
        });
        console.warn("Ingestion Worker: Tentativa de acesso não autorizado.");
        return new Response('Unauthorized', { status: 401 });
      }

      // 3. Parsear o corpo da requisição
      const event: WhatsappEvent = await request.json();
      toucan.addBreadcrumb({
        message: `Processando evento ${event.event_id}`,
        category: 'whatsapp_event',
        data: {
          group_id: event.group_id,
          event_type: event.event_type,
        }
      });

      // 4. Validar dados mínimos do evento
      if (!event.id || !event.event_id || !event.group_id || !event.event_type || !event.event_timestamp || !event.raw_payload) {
        console.error("Ingestion Worker: Dados de evento incompletos.", event);
        return new Response('Bad Request: Missing required event fields', { status: 400 });
      }

      // 5. Inserir o evento no D1
      const { success } = await env.DB.prepare(
        `INSERT INTO whatsapp_events (id, event_id, group_id, sender_id, event_type, event_timestamp, message_body, quoted_message_id, raw_payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        event.id,
        event.event_id,
        event.group_id,
        event.sender_id || null,
        event.event_type,
        event.event_timestamp,
        event.message_body || null,
        event.quoted_message_id || null,
        event.raw_payload
      )
      .run();

      if (!success) {
        throw new Error(`Falha ao inserir evento ${event.event_id} no D1.`);
      }
      console.log(`✅ Ingestion Worker: Evento ${event.event_id} inserido com sucesso.`);

      return new Response('Event ingested successfully', { status: 200 });

    } catch (error: any) {
      console.error("❌ Ingestion Worker: Erro ao processar requisição:", error);
      toucan.captureException(error);
      return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
    }
  },
};
