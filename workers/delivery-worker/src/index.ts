import Toucan from 'toucan-js';
import { PublicationJob, JobStatus } from '../../common/types.js';

// Define a estrutura do ambiente de execução do Worker
export interface Env {
  DB: D1Database;
  GATEWAY_URL: string;       // Ex: http://<ip-do-termux>:3000
  GATEWAY_AUTH_TOKEN: string;
  SENTRY_DSN: string;
  STATUS_WORKER: Fetcher;
}

// Helper para reportar status, adaptado para ser chamado de qualquer função
async function reportStatus(env: Env, ctx: ExecutionContext, jobId: string, eventType: string, details: object) {
  if (env.STATUS_WORKER) {
    try {
      const payload = {
        workerName: "delivery-worker",
        jobId: jobId,
        eventType,
        details,
      };
      ctx.waitUntil(env.STATUS_WORKER.fetch("http://status-worker/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
    } catch (e) {
      console.error("Falha ao reportar status para o status-worker:", e);
    }
  }
}

export default {
  // O Cron Trigger invoca este método
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const toucan = new Toucan({
      dsn: env.SENTRY_DSN,
      context: ctx,
      request: new Request('https://delivery-worker.scheduled'), // Request simulado para o contexto
    });
    console.log("Worker: Delivery - Iniciado por Cron Trigger");

    try {
      // 1. Buscar jobs prontos
      const { results } = await env.DB.prepare(
        "SELECT * FROM publication_jobs WHERE status = 'ready' ORDER BY created_at ASC LIMIT 5"
      ).all<PublicationJob>();

      if (!results || results.length === 0) {
        console.log("Nenhum job pronto para entrega encontrado.");
        return;
      }

      console.log(`Encontrados ${results.length} jobs para entregar.`);
      toucan.addBreadcrumb({
        message: `Encontrados ${results.length} jobs para processar.`,
        category: 'job_fetching',
      });

      for (const job of results) {
        ctx.waitUntil(processJob(job, env, ctx));
      }

    } catch (error: any) {
      console.error("❌ Erro fatal no Delivery Worker (scheduled):", error);
      toucan.captureException(error);
    }
  },
};

// Processa um único job
async function processJob(job: PublicationJob, env: Env, ctx: ExecutionContext): Promise<void> {
  const toucan = new Toucan({
    dsn: env.SENTRY_DSN,
    context: ctx,
  });
  toucan.setTag('job_id', job.id);
  toucan.setContext('job_details', {
    target_group_id: job.targetGroupId,
    media_count: job.mediaUrls.length,
  });

  console.log(`Processando job ${job.id}...`);
  await reportStatus(env, ctx, job.id, "DELIVERY_STARTED", { target: job.targetGroupId, mediaCount: job.mediaUrls.length });

  try {
    // Marcar como delivering
    await updateJobStatus(
      env.DB,
      job.id,
      'delivering',
      (job.attempts || 0) + 1
    );
    toucan.addBreadcrumb({ message: 'Job marcado como delivering.', category: 'job_status' });

    // 2. Baixar imagens
    const imageUrls: string[] = job.mediaUrls;
    console.log(`Baixando ${imageUrls.length} imagens para o job ${job.id}...`);

    const imageDownloads = await Promise.all(
      imageUrls.map(async (url, index) => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Falha ao baixar imagem ${index + 1}`);
          }

          const buffer = await response.arrayBuffer();
          return new File([buffer], `image_${index}.jpg`, {
            type: 'image/jpeg',
          });
        } catch (e: any) {
          console.error(`Erro ao baixar ${url}:`, e.message);
          return null;
        }
      })
    );

    const imageFiles = imageDownloads.filter(Boolean) as File[];

    if (imageFiles.length !== imageUrls.length) {
      throw new Error("Falha no download de uma ou mais imagens.");
    }

    console.log(`Download de ${imageFiles.length} imagens concluído.`);
    toucan.addBreadcrumb({ message: 'Download de imagens concluído.', category: 'media_processing' });

    // 3. Montar FormData
    const formData = new FormData();
    formData.append('jid', job.targetGroupId);
    formData.append('caption', job.caption);

    imageFiles.forEach((file) => {
      formData.append('images', file);
    });

    // 4. Enviar ao gateway (fetch NATIVO)
    console.log(`Enviando job ${job.id} para ${env.GATEWAY_URL}...`);
    toucan.addBreadcrumb({ message: 'Enviando para o gateway.', category: 'gateway_communication' });

    const gatewayResponse = await fetch(
      `${env.GATEWAY_URL}/publish`,
      {
        method: 'POST',
        body: formData,
        headers: {
          'X-Auth-Token': env.GATEWAY_AUTH_TOKEN,
        },
      }
    );

    if (!gatewayResponse.ok) {
      const errorBody = await gatewayResponse.text();
      throw new Error(
        `Gateway retornou erro ${gatewayResponse.status}: ${errorBody}`
      );
    }

    const responseJson = await gatewayResponse.json();
    console.log(`✅ Job ${job.id} publicado com sucesso:`, responseJson);
    await reportStatus(env, ctx, job.id, "DELIVERY_COMPLETED", { gatewayResponse: responseJson });


    // 5. Marcar como published
    await updateJobStatus(env.DB, job.id, 'published');
    toucan.addBreadcrumb({ message: 'Job marcado como published.', category: 'job_status' });

  } catch (error: any) {
    console.error(`❌ Falha no job ${job.id}:`, error.message);
    toucan.captureException(error);
    await reportStatus(env, ctx, job.id, "DELIVERY_FAILED", { error: error.message });

    await updateJobStatus(
      env.DB,
      job.id,
      'failed',
      undefined,
      error.message
    );
  }
