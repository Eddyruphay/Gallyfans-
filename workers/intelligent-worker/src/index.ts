// src/workers/intelligent-worker/index.ts

import { CoordinatedJob } from '../../common/types.js';

// Worker 2: Intelligent Worker
// Responsável por ler eventos do D1, analisar dados, decidir sobre ofertas/conteúdo
// e criar um novo job no JobCoordinator.

export interface Env {
  DB: D1Database;
  JOB_COORDINATOR: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    console.log("Worker: Intelligent - Iniciado");

    try {
      // 1. Simular a consulta e análise de dados do D1
      // Em um cenário real, aqui haveria uma lógica complexa para consultar
      // métricas, popularidade, reações, etc.
      // const { results } = await env.DB.prepare("SELECT * FROM events ORDER BY timestamp DESC LIMIT 10").all();
      console.log("Analisando métricas e decidindo sobre o próximo conteúdo...");

      // 2. Com base na análise, definir as regras para o próximo job
      // Isso pode vir de uma tabela de estratégias ou ser gerado dinamicamente.
      const jobRules: Partial<CoordinatedJob> = {
        rules: {
          niche: 'popular',
          categories: ['casting', 'teen'],
          tags: ['new-talent'],
          offerId: 'crakrevenue-offer-123', // Exemplo de ID de oferta
        },
      };
      console.log("Regras definidas para o novo job:", jobRules);

      // 3. Obter o stub do Durable Object
      const doId = env.JOB_COORDINATOR.idFromName("main-coordinator");
      const stub = env.JOB_COORDINATOR.get(doId);

      // 4. Chamar o endpoint para criar o novo job no JobCoordinator
      const response = await stub.fetch("http://do/jobs", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobRules),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Falha ao criar job no JobCoordinator: ${errorText}`);
      }

      const newJob: CoordinatedJob = await response.json();
      console.log("✅ Novo job criado com sucesso no JobCoordinator:", newJob);

      return new Response(
        JSON.stringify({
          message: "Intelligent Worker: Job criado com sucesso.",
          jobId: newJob.id,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );

    } catch (error: any) {
      console.error("❌ Erro no Intelligent Worker:", error);
      return new Response(error.message, { status: 500 });
    }
  },
};
