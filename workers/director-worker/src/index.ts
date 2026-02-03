// src/workers/director-worker/index.ts

import { JobState } from '../../common/types.js'; 

// Worker 4: Director Worker
// Responsável por iniciar um novo ciclo de vida de um job através do JobCoordinator.
// A classe JobCoordinator é exportada via 'main' no wrangler.toml deste worker,
// pois este worker é o 'host' do Durable Object.

export interface Env {
  DB: D1Database; 
  JOB_COORDINATOR: DurableObjectNamespace;
  TARGET_GROUP_ID: string; 
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    console.log("[DirectorWorker] - Iniciado");

    try {
      // 1. Obter um stub para a instância singleton do JobCoordinator Durable Object.
      // Usamos um nome fixo para garantir que sempre interagimos com a mesma instância do DO
      // para gerenciar os jobs.
      const doId = env.JOB_COORDINATOR.idFromName("singleton_job_coordinator");
      const stub = env.JOB_COORDINATOR.get(doId);

      // 2. Definir o payload inicial para o novo job.
      // Nesta fase, um payload simples é suficiente, sem lógica complexa.
      const initialPayload = {
        message: "Novo job de publicação iniciado pelo DirectorWorker.",
        timestamp: new Date().toISOString(),
      };

      // 3. Invocar o método 'startJob' do JobCoordinator via sua API HTTP.
      // O JobCoordinator gerenciará a criação do ID do job e a transição inicial de estado.
      console.log("[DirectorWorker] Chamando JobCoordinator para iniciar um novo job...");
      const startJobResponse = await stub.fetch("http://do/job/start", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initialPayload),
      });

      if (!startJobResponse.ok) {
        const errorText = await startJobResponse.text();
        throw new Error(`Falha ao iniciar job no JobCoordinator: ${startJobResponse.status} - ${errorText}`);
      }

      const { jobId, state } = await startJobResponse.json();
      console.log(`[DirectorWorker] Job ${jobId} iniciado com sucesso no JobCoordinator. Estado inicial: ${state}`);

      return new Response(
        JSON.stringify({
          message: "DirectorWorker: Novo job iniciado com sucesso.",
          jobId: jobId,
          coordinatorState: state,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );

    } catch (error: any) {
      console.error("[DirectorWorker] ❌ Erro ao iniciar job:", error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  },
};
