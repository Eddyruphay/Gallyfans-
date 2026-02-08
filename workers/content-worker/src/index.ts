import Toucan from 'toucan-js';
import { CoordinatedJob, JobState } from '../../common/types.js';
export { JobCoordinator } from '../../durable-objects/JobCoordinator.js';

// Item selecionado pelo CuratorWorker
interface SelectedItem {
  source_url: string;
  title: string;
  image_url: string;
  channel?: string;
}

// Item final, enriquecido com a legenda gerada
export interface FinalItem {
  source_url: string;
  title: string;
  generated_caption: string;
  image_url: string;
  channel?: string;
}

export interface Env {
  JOB_COORDINATOR: DurableObjectNamespace;
  SENTRY_DSN: string;
  STATUS_WORKER: Fetcher;
}

// O ContentWorker é responsável por gerar conteúdo (legendas) para um item selecionado.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const toucan = new Toucan({
      dsn: env.SENTRY_DSN,
      context: ctx,
      request: request,
    });

    console.log("[ContentWorker] - Iniciado");

    let jobId: string | undefined;
    let jobCoordinatorStub: DurableObjectStub | undefined;

    const reportStatus = async (eventType: string, details: object) => {
      if (env.STATUS_WORKER && jobId) {
        try {
          const payload = {
            workerName: "content-worker",
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
      // 1. Extrair jobId e selected_item do payload
      const { jobId: receivedJobId, currentPayload } = await request.json<any>();
      jobId = receivedJobId;
      const selectedItem: SelectedItem = currentPayload?.selected_item;

      toucan.setContext('jobId', jobId);
      toucan.addBreadcrumb({
        message: 'Payload recebido',
        category: 'job_processing',
        data: {
          hasJobId: !!jobId,
          hasSelectedItem: !!selectedItem,
        },
      });

      if (!jobId || !selectedItem) {
        throw new Error("JobId e 'selected_item' válidos são obrigatórios no payload.");
      }
      console.log(`[ContentWorker] Processando Job ID: ${jobId}. Recebido item: ${selectedItem.title}`);

      await reportStatus("CONTENT_GENERATION_STARTED", { title: selectedItem.title });

      // 2. Obter o stub do JobCoordinator
      const doId = env.JOB_COORDINATOR.idFromName("singleton_job_coordinator");
      jobCoordinatorStub = env.JOB_COORDINATOR.get(doId);

      // 3. Lógica de Geração de Conteúdo: Criar uma legenda.
      const generatedCaption = `✨ Conteúdo exclusivo! "${selectedItem.title}" no canal #${selectedItem.channel}. Não perca! Saiba mais em: ${selectedItem.source_url} ✨`;

      const finalItem: FinalItem = {
        ...selectedItem,
        generated_caption: generatedCaption,
      };

      await reportStatus("CONTENT_GENERATION_COMPLETED", { captionLength: generatedCaption.length });

      toucan.addBreadcrumb({
        message: 'Legenda gerada. Avançando para o próximo estado.',
        category: 'job_processing',
      });

      // 4. Chamar o JobCoordinator para avançar o estado do job
      const resultPayload = { final_item: finalItem };
      await jobCoordinatorStub.fetch(`http://do/job/${jobId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resultPayload),
      });

      console.log(`[ContentWorker] ✅ Sucesso! Item final reportado ao JobCoordinator para o job ${jobId}.`);
      return new Response(JSON.stringify({ success: true, jobId, finalItem }));

    } catch (error: any) {
      console.error(`[ContentWorker] ❌ Erro: ${error.message}`);
      toucan.captureException(error);

      await reportStatus("CONTENT_GENERATION_FAILED", { error: error.message });

      if (jobId && jobCoordinatorStub) {
        ctx.waitUntil(jobCoordinatorStub.fetch(`http://do/job/${jobId}/fail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: error.message }),
        }));
      }
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
    }
  },
};
