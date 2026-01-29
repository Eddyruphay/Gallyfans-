// src/workers/director-worker/index.ts

import { CoordinatedJob, PublicationJob } from '../../common/types.js';
import { JobCoordinator } from '../../durable-objects/JobCoordinator.js';

// Exportar a classe do Durable Object para que o Wrangler a possa encontrar.
export { JobCoordinator };

// Worker 4: Director Worker
// Responsável por pegar jobs em revisão, validar, gerar a legenda final,
// e salvar o job pronto para publicação no banco de dados D1.

export interface Env {
  DB: D1Database;
  JOB_COORDINATOR: DurableObjectNamespace;
  // Adicionar uma variável de ambiente para o JID de destino padrão
  TARGET_GROUP_ID: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    console.log("Worker: Director - Iniciado");

    try {
      // 1. Obter o stub do Durable Object
      const doId = env.JOB_COORDINATOR.idFromName("main-coordinator");
      const stub = env.JOB_COORDINATOR.get(doId);

      // 2. Reivindicar o próximo job em revisão
      console.log("Buscando próximo job para revisão...");
      const claimResponse = await stub.fetch("http://do/jobs/claim-review", { method: 'POST' });

      if (claimResponse.status === 404) {
        console.log("Nenhum job para revisar encontrado.");
        return new Response("Director Worker: Nenhum job para revisar.");
      }

      if (!claimResponse.ok) {
        throw new Error("Falha ao reivindicar job do JobCoordinator.");
      }

      const job: CoordinatedJob = await claimResponse.json();
      console.log(`Job ${job.id} reivindicado para direção. Status: ${job.status}.`);

      // 3. Validar os dados do job
      if (!job.rules || !job.content) {
        throw new Error(`Job ${job.id} está incompleto. Faltam 'rules' ou 'content'.`);
      }

      // 4. Gerar a legenda final combinando as informações
      console.log("Gerando legenda final...");
      const captionParts = [
        `✨ ${job.content.modelBio || 'Confira a galeria'} ✨`,
        `Nicho: ${job.rules.niche}`,
        `Tags: #${job.rules.tags.join(' #')}`,
        `Categorias: ${job.rules.categories.join(', ')}`,
        job.rules.offerId ? `\nOferta especial: https://offers.example.com/${job.rules.offerId}` : '',
        `\nVeja o set completo: ${job.content.sourceUrl}`
      ];
      const finalCaption = captionParts.filter(part => part).join('\n\n');
      console.log("Legenda final gerada:", finalCaption);

      // 5. Preparar o objeto final para ser salvo no D1, aderindo ao contrato PublicationJob
      const now = new Date().toISOString();
      const publicationJob: PublicationJob = {
        id: job.id,
        targetGroupId: env.TARGET_GROUP_ID, // Usar a variável de ambiente
        caption: finalCaption,
        mediaUrls: job.content.images,
        affiliateLink: job.rules.offerId ? `https://offers.example.com/${job.rules.offerId}` : undefined,
        tags: job.rules.tags,
        source: job.content.sourceUrl,
        status: 'ready',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };

      // 6. Salvar o job finalizado no D1
      console.log(`Salvando job ${publicationJob.id} no D1 com status 'ready'...`);
      const { success } = await env.DB.prepare(
        `INSERT INTO publication_jobs (id, targetGroupId, caption, mediaUrls, affiliateLink, tags, source, status, attempts, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        publicationJob.id,
        publicationJob.targetGroupId,
        publicationJob.caption,
        JSON.stringify(publicationJob.mediaUrls), // Salvar array como JSON string
        publicationJob.affiliateLink || null,
        JSON.stringify(publicationJob.tags || []), // Salvar array como JSON string
        publicationJob.source,
        publicationJob.status,
        publicationJob.attempts,
        publicationJob.createdAt,
        publicationJob.updatedAt
      )
      .run();

      if (!success) {
        throw new Error(`Falha ao salvar o job ${publicationJob.id} no D1.`);
      }
      console.log(`✅ Job ${publicationJob.id} salvo no D1.`);

      // 7. Marcar o job como 'complete' no Durable Object para finalizar o ciclo
      await stub.fetch(`http://do/jobs/${job.id}/complete`, { method: 'POST' });
      console.log(`Job ${job.id} marcado como 'complete' no JobCoordinator.`);

      return new Response(
        JSON.stringify({
          message: "Director Worker: Job finalizado e pronto para publicação no D1.",
          jobId: publicationJob.id,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );

    } catch (error: any) {
      console.error("❌ Erro no Director Worker:", error);
      return new Response(error.message, { status: 500 });
    }
  },
};
