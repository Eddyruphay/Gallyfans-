// src/workers/curator-worker/index.ts

import { CoordinatedJob, JobState } from '../../common/types.js';

interface GalleryData {
  channel: string;
  originalId: string;
  title: string;
  url: string;
  thumbnailUrl: string;
}

export interface SelectedItem {
  source_url: string;
  title: string;
  image_url: string;
  channel?: string;
}

export interface Env {
  JOB_COORDINATOR: DurableObjectNamespace;
}

// O CuratorWorker é responsável por filtrar e selecionar o melhor item dos dados brutos do SearchWorker.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    console.log("[CuratorWorker] - Iniciado");

    let jobId: string | undefined;
    let jobCoordinatorStub: DurableObjectStub | undefined;

    try {
      // 1. Extrair jobId e raw_results do payload da requisição.
      const { jobId: receivedJobId, currentPayload } = await request.json<any>();
      jobId = receivedJobId;
      const rawResults: GalleryData[] = currentPayload?.raw_results;

      if (!jobId || !rawResults || rawResults.length === 0) {
        throw new Error("JobId e 'raw_results' válidos são obrigatórios no payload.");
      }
      console.log(`[CuratorWorker] Processando Job ID: ${jobId}. Recebidos ${rawResults.length} resultados brutos.`);

      // 2. Obter o stub do JobCoordinator para comunicação de retorno.
      const doId = env.JOB_COORDINATOR.idFromName("singleton_job_coordinator");
      jobCoordinatorStub = env.JOB_COORDINATOR.get(doId);

      // 3. Lógica de Curadoria Simplificada: Selecionar o primeiro resultado.
      const selectedGallery = rawResults[0]; // Simplificação: apenas pega o primeiro
      console.log(`[CuratorWorker] Galeria selecionada para curadoria: ${selectedGallery.title}`);

      const selectedItem: SelectedItem = {
        source_url: selectedGallery.url,
        title: selectedGallery.title,
        image_url: selectedGallery.thumbnailUrl,
        channel: selectedGallery.channel,
      };

      // 4. Chamar o JobCoordinator para avançar o estado do job.
      const resultPayload = { selected_item: selectedItem };
      await jobCoordinatorStub.fetch(`http://do/job/${jobId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resultPayload),
      });

      console.log(`[CuratorWorker] ✅ Sucesso! Item selecionado reportado ao JobCoordinator para o job ${jobId}.`);
      return new Response(JSON.stringify({ success: true, jobId, selectedItem }));

    } catch (error: any) {
      console.error(`[CuratorWorker] ❌ Erro: ${error.message}`);
      // Se a chamada falhar, notificar o JobCoordinator sobre a falha.
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
