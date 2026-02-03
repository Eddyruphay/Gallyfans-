// src/workers/content-worker/index.ts

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
}

// O ContentWorker é responsável por gerar conteúdo (legendas) para um item selecionado.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    console.log("[ContentWorker] - Iniciado");

    let jobId: string | undefined;
    let jobCoordinatorStub: DurableObjectStub | undefined;

    try {
      // 1. Extrair jobId e selected_item do payload
      const { jobId: receivedJobId, currentPayload } = await request.json<any>();
      jobId = receivedJobId;
      const selectedItem: SelectedItem = currentPayload?.selected_item;

      if (!jobId || !selectedItem) {
        throw new Error("JobId e 'selected_item' válidos são obrigatórios no payload.");
      }
      console.log(`[ContentWorker] Processando Job ID: ${jobId}. Recebido item: ${selectedItem.title}`);

      // 2. Obter o stub do JobCoordinator
      const doId = env.JOB_COORDINATOR.idFromName("singleton_job_coordinator");
      jobCoordinatorStub = env.JOB_COORDINATOR.get(doId);

      // 3. Lógica de Geração de Conteúdo: Criar uma legenda.
      const generatedCaption = `✨ Conteúdo exclusivo! "${selectedItem.title}" no canal #${selectedItem.channel}. Não perca! Saiba mais em: ${selectedItem.source_url} ✨`;

      const finalItem: FinalItem = {
        ...selectedItem,
        generated_caption: generatedCaption,
      };

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
      if (jobId && jobCoordinatorStub) {
        await jobCoordinatorStub.fetch(`http://do/job/${jobId}/fail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: error.message }),
        });
      }
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
    }
  },
};
