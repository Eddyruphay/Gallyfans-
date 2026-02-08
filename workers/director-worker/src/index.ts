export { JobCoordinator } from '../../durable-objects/JobCoordinator.js'; 

// Worker 4: Director Worker
// Responsável por iniciar um novo ciclo de vida de um job através do JobCoordinator.

export interface Env {
  DB: D1Database; 
  JOB_COORDINATOR: DurableObjectNamespace;
  TARGET_GROUP_ID: string; 
  SENTRY_DSN: string;
  STATUS_WORKER: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const toucan = new Toucan({
      dsn: env.SENTRY_DSN,
      context: ctx,
      request: request,
    });

    console.log("[DirectorWorker] - Iniciado");

    const reportStatus = async (jobId: string, eventType: string, details: object) => {
      if (env.STATUS_WORKER) {
        try {
          const payload = {
            workerName: "director-worker",
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
    };

    try {
      // Obter o parâmetro 'channel' da URL da requisição
      const url = new URL(request.url);
      const channel = url.searchParams.get('channel');

      if (!channel) {
        throw new Error("O parâmetro 'channel' é obrigatório na requisição.");
      }

      // Reporta o recebimento da requisição antes mesmo de ter um Job ID
      reportStatus('pending_creation', 'DIRECTOR_RECEIVED_REQUEST', { channel });

      // 1. Obter um stub para a instância singleton do JobCoordinator Durable Object.
      const doId = env.JOB_COORDINATOR.idFromName("singleton_job_coordinator");
      const stub = env.JOB_COORDINATOR.get(doId);
      
      toucan.addBreadcrumb({
        message: 'Stub do JobCoordinator obtido.',
        category: 'durable_object',
      });

      // 2. Definir o payload inicial para o novo job, incluindo o channel.
      const initialPayload = {
        message: "Novo job de publicação iniciado pelo DirectorWorker.",
        timestamp: new Date().toISOString(),
        channel: channel,
      };

      // 3. Invocar o método 'startJob' do JobCoordinator.
      console.log("[DirectorWorker] Chamando JobCoordinator para iniciar um novo job...");
      const startJobResponse = await stub.fetch("http://do/job/start", {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initialPayload),
      });

      if (!startJobResponse.ok) {
        const errorText = await startJobResponse.text();
        throw new Error(`Falha ao iniciar job no JobCoordinator: ${startJobResponse.status} - ${errorText}`);
      }

      const { jobId, state } = await startJobResponse.json();
      toucan.setTag('job_id', jobId);

      // Reporta que o Job foi criado com sucesso
      reportStatus(jobId, 'DIRECTOR_JOB_STARTED', { state });

      toucan.addBreadcrumb({
        message: `Job ${jobId} iniciado com sucesso.`,
        category: 'job_lifecycle',
        data: { state },
      });
      console.log(`[DirectorWorker] Job ${jobId} iniciado com sucesso no JobCoordinator. Estado inicial: ${state}`);

      return new Response(
        JSON.stringify({
          message: "DirectorWorker: Novo job iniciado com sucesso.",
          jobId: jobId,
          coordinatorState: state,
        }),
        { headers: { "Content-Type": "application/json" } }
      );

    } catch (error: any) {
      console.error("[DirectorWorker] ❌ Erro ao iniciar job:", error.message);
      toucan.captureException(error);
      
      // Reporta a falha
      reportStatus('unknown', 'DIRECTOR_FAILED', { error: error.message });

      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  },
};