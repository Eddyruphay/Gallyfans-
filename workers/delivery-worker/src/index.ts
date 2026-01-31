// src/workers/delivery-worker/index.ts

import { PublicationJob, JobStatus } from '../../common/types.js';

// Define a estrutura do ambiente de execução do Worker
export interface Env {
  DB: D1Database;
  GATEWAY_URL: string;       // Ex: http://<ip-do-termux>:3000
  GATEWAY_AUTH_TOKEN: string;
}

export default {
  // O Cron Trigger invoca este método
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
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

      for (const job of results) {
        ctx.waitUntil(processJob(job, env));
      }

    } catch (error: any) {
      console.error("❌ Erro fatal no Delivery Worker (scheduled):", error);
    }
  },
};

// Processa um único job
async function processJob(job: PublicationJob, env: Env): Promise<void> {
  console.log(`Processando job ${job.id}...`);

  try {
    // Marcar como delivering
    await updateJobStatus(
      env.DB,
      job.id,
      'delivering',
      (job.attempts || 0) + 1
    );

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

    // 3. Montar FormData
    const formData = new FormData();
    formData.append('jid', job.targetGroupId);
    formData.append('caption', job.caption);

    imageFiles.forEach((file) => {
      formData.append('images', file);
    });

    // 4. Enviar ao gateway (fetch NATIVO)
    console.log(`Enviando job ${job.id} para ${env.GATEWAY_URL}...`);

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

    // 5. Marcar como published
    await updateJobStatus(env.DB, job.id, 'published');

  } catch (error: any) {
    console.error(`❌ Falha no job ${job.id}:`, error.message);
    await updateJobStatus(
      env.DB,
      job.id,
      'failed',
      undefined,
      error.message
    );
  }
}

// Atualiza status no D1
async function updateJobStatus(
  db: D1Database,
  id: string,
  status: JobStatus,
  attempts?: number,
  error?: string
) {
  let query = "UPDATE publication_jobs SET status = ?, updated_at = ?";
  const params: (string | number | null)[] = [
    status,
    new Date().toISOString(),
  ];

  if (attempts !== undefined) {
    query += ", attempts = ?";
    params.push(attempts);
  }

  if (error !== undefined) {
    query += ", error = ?";
    params.push(error);
  }

  query += " WHERE id = ?";
  params.push(id);

  await db.prepare(query).bind(...params).run();
  console.log(`Status do job ${id} atualizado para '${status}'.`);
}
