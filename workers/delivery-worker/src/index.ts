// src/workers/delivery-worker/index.ts

import { FormData, fetch as undiciFetch, File } from 'undici';
import { PublicationJob, JobStatus } from '../../common/types.js';

// Define a estrutura do ambiente de execução do Worker
export interface Env {
  DB: D1Database;
  // Variáveis de ambiente para configurar o worker
  GATEWAY_URL: string; // URL do gateway no Termux. Ex: http://<ip-do-termux>:3000
  GATEWAY_AUTH_TOKEN: string; // Token para autenticar com o gateway
}

export default {
  // O Cron Trigger invoca este método 'scheduled'
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("Worker: Delivery - Iniciado por Cron Trigger");

    try {
      // 1. Buscar jobs prontos para publicação no D1
      const { results } = await env.DB.prepare(
        "SELECT * FROM publication_jobs WHERE status = 'ready' ORDER BY created_at ASC LIMIT 5" // Limita a 5 jobs por execução
      ).all<PublicationJob>();

      if (!results || results.length === 0) {
        console.log("Nenhum job pronto para entrega encontrado.");
        return;
      }

      console.log(`Encontrados ${results.length} jobs para entregar.`);

      // Processar cada job em sequência para não sobrecarregar o gateway
      for (const job of results) {
        // O ctx.waitUntil permite que o processamento continue mesmo após a resposta inicial
        ctx.waitUntil(processJob(job, env));
      }

    } catch (error: any) {
      console.error("❌ Erro fatal no Delivery Worker (scheduled):", error);
    }
  },
};

// Função isolada para processar um único job
async function processJob(job: PublicationJob, env: Env): Promise<void> {
  console.log(`Processando job ${job.id}...`);

  try {
    // Marcar o job como 'delivering' para evitar que outra instância o pegue
    await updateJobStatus(env.DB, job.id, 'delivering', (job.attempts || 0) + 1);

    // 2. Baixar as imagens das URLs em paralelo
    const imageUrls: string[] = job.mediaUrls; // Usar o campo do tipo canônico
    console.log(`Baixando ${imageUrls.length} imagens para o job ${job.id}...`);

    const imageDownloads = await Promise.all(imageUrls.map(async (url, index) => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Falha ao baixar a imagem ${index + 1}: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        // O nome do ficheiro é importante para o Multer no gateway
        return new File([arrayBuffer], `image_${index}.jpg`, { type: 'image/jpeg' });
      } catch (e: any) {
        console.error(`Erro no download da imagem ${url}:`, e.message);
        return null; // Retorna nulo se uma imagem falhar
      }
    }));

    const imageFiles = imageDownloads.filter(file => file !== null) as File[];

    // Se alguma imagem falhar, o job falha
    if (imageFiles.length !== imageUrls.length) {
      throw new Error("Falha no download de uma ou mais imagens.");
    }

    console.log(`Download de ${imageFiles.length} imagens concluído.`);

    // 3. Montar o FormData para enviar ao gateway
    const formData = new FormData();
    formData.append('jid', job.targetGroupId); // Usar o campo do tipo canônico
    formData.append('caption', job.caption);
    
    imageFiles.forEach((file) => {
      formData.append('images', file);
    });

    // 4. Enviar o job para o gateway
    console.log(`Enviando job ${job.id} para o gateway em ${env.GATEWAY_URL}...`);
    
    // Usar undiciFetch para enviar FormData em workers
    const gatewayResponse = await undiciFetch(`${env.GATEWAY_URL}/publish`, {
      method: 'POST',
      body: formData,
      headers: {
        // Adicionar um token de autenticação simples para segurança
        'X-Auth-Token': env.GATEWAY_AUTH_TOKEN,
      },
    });

    if (!gatewayResponse.ok) {
      const errorBody = await gatewayResponse.text();
      throw new Error(`Gateway retornou erro ${gatewayResponse.status}: ${errorBody}`);
    }

    const responseJson: any = await gatewayResponse.json();
    console.log(`✅ Gateway respondeu com sucesso para o job ${job.id}:`, responseJson);

    // 5. Marcar o job como 'published' no D1
    await updateJobStatus(env.DB, job.id, 'published');

  } catch (error: any) {
    console.error(`❌ Falha ao processar o job ${job.id}:`, error.message);
    // Marcar o job como 'failed' no D1 com a mensagem de erro
    await updateJobStatus(env.DB, job.id, 'failed', undefined, error.message);
  }
}

// Função utilitária para atualizar o status do job no D1
async function updateJobStatus(db: D1Database, id: string, status: JobStatus, attempts?: number, error?: string) {
  let query = "UPDATE publication_jobs SET status = ?, updated_at = ? ";
  const params: (string | number | null)[] = [status, new Date().toISOString()];

  if (attempts !== undefined) {
    query += ", attempts = ? ";
    params.push(attempts);
  }
  if (error !== undefined) {
    query += ", error = ? ";
    params.push(error);
  }
  
  query += "WHERE id = ?";
  params.push(id);

  await db.prepare(query).bind(...params).run();
  console.log(`Status do job ${id} atualizado para '${status}'.`);
}
