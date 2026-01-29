// src/workers/content-worker/index.ts

import { CoordinatedJob } from '../../common/types.js';

// Worker 3: Content Worker
// Responsável por pegar jobs pendentes do JobCoordinator, coletar o conteúdo
// de fontes externas e atualizar o job, movendo-o para o estado de 'review'.

export interface Env {
  DB: D1Database; // Embora não usado diretamente, pode ser necessário para futuras validações
  JOB_COORDINATOR: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    console.log("Worker: Content - Iniciado");

    try {
      // 1. Obter o stub do Durable Object
      const doId = env.JOB_COORDINATOR.idFromName("main-coordinator");
      const stub = env.JOB_COORDINATOR.get(doId);

      // 2. Reivindicar o próximo job pendente
      console.log("Buscando próximo job pendente...");
      const claimResponse = await stub.fetch("http://do/jobs/claim-pending", { method: 'POST' });

      // Se não houver jobs, encerrar pacificamente
      if (claimResponse.status === 404) {
        console.log("Nenhum job pendente encontrado.");
        return new Response("Content Worker: Nenhum job pendente.");
      }

      if (!claimResponse.ok) {
        throw new Error("Falha ao reivindicar job do JobCoordinator.");
      }

      const job: CoordinatedJob = await claimResponse.json();
      console.log(`Job ${job.id} reivindicado. Status: ${job.status}.`);
      
      if (!job.rules) {
        throw new Error(`Job ${job.id} está incompleto. Faltam 'rules'.`);
      }
      console.log("Regras do job:", job.rules);

      // 3. Simular o processo de scraping com base nas regras do job
      // Em um cenário real, aqui se usaria fetch() para buscar dados de uma API ou site.
      console.log(`Iniciando scraping para o nicho: ${job.rules.niche}...`);
      const scrapedContent: CoordinatedJob['content'] = {
        sourceUrl: `https://example.com/gallery/${crypto.randomUUID()}`,
        images: [
          "https://example.com/img1.jpg",
          "https://example.com/img2.jpg",
          "https://example.com/img3.jpg",
        ],
        modelBio: "Esta é uma bio de modelo simulada.",
      };
      console.log("Conteúdo coletado:", scrapedContent);

      // 4. Atualizar o job no JobCoordinator com o conteúdo coletado
      const updateResponse = await stub.fetch(`http://do/jobs/${job.id}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scrapedContent),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Falha ao atualizar job no JobCoordinator: ${errorText}`);
      }
      
      const updatedJobInfo = await updateResponse.json();
      console.log(`✅ Job ${updatedJobInfo.id} atualizado para o status '${updatedJobInfo.status}'.`);

      return new Response(
        JSON.stringify({
          message: "Content Worker: Job processado e movido para revisão.",
          jobId: updatedJobInfo.id,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );

    } catch (error: any) {
      console.error("❌ Erro no Content Worker:", error);
      return new Response(error.message, { status: 500 });
    }
  },
};
