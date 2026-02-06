// src/workers/search-worker/search-worker.ts

interface GalleryData {
  channel: string;
  originalId: string;
  title: string;
  url: string;
  thumbnailUrl: string;
}

export { JobCoordinator } from '../../durable-objects/JobCoordinator.js';

export interface Env {
  // Binding para o Durable Object que coordena o ciclo de vida dos jobs.
  JOB_COORDINATOR: DurableObjectNamespace;
}

// O SearchWorker é responsável por coletar dados brutos de uma fonte externa.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    console.log("[SearchWorker] - Iniciado");

    let jobId: string | undefined;
    let jobCoordinatorStub: DurableObjectStub | undefined;

    try {
      // 1. Extrair jobId e channel do payload da requisição.
      // Esta requisição virá do JobCoordinator.
      const { jobId: receivedJobId, currentPayload } = await request.json<any>();
      jobId = receivedJobId;
      const channel = currentPayload?.channel;

      if (!jobId || !channel) {
        throw new Error("JobId e 'channel' no payload são obrigatórios.");
      }
      console.log(`[SearchWorker] Processando Job ID: ${jobId} para o canal: ${channel}`);

      // 2. Obter o stub do JobCoordinator para comunicação de retorno.
      const doId = env.JOB_COORDINATOR.idFromName("singleton_job_coordinator");
      jobCoordinatorStub = env.JOB_COORDINATOR.get(doId);

      // 3. Montar a URL e fazer a requisição de scraping
      const url = `https://www.pornpics.com/channels/${channel}/`;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      };

      console.log(`[SearchWorker] Buscando em: ${url}`);
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Falha ao buscar a URL: ${response.status} ${response.statusText}`);
      }

      // 4. Usar HTMLRewriter para processar a resposta e extrair dados
      const galleries: GalleryData[] = [];
      let currentLink: string | null = null;

      const rewriter = new HTMLRewriter()
        .on('li.thumbwook a.rel-link', {
          element(element) {
            // Captura o link quando o elemento âncora começa
            currentLink = element.getAttribute('href');
          },
        })
        .on('li.thumbwook a.rel-link img', {
          element(img) {
            // Este handler é para a imagem DENTRO do link.
            // Agora temos acesso ao 'currentLink' do escopo externo.
            const title = img.getAttribute('alt');
            const thumbnailUrl = img.getAttribute('src');
            
            if (currentLink && title && thumbnailUrl) {
              const originalId = currentLink.split('/')[4];
              if (originalId) {
                galleries.push({
                  channel: channel,
                  originalId: originalId,
                  title: title,
                  url: currentLink,
                  thumbnailUrl: thumbnailUrl,
                });
              }
            }
          },
        })
        .on('li.thumbwook', {
            element(el) {
                // Reseta o estado a cada novo item de lista para evitar contaminação
                currentLink = null;
            }
        });

      await rewriter.transform(response).text(); // Consome o stream e executa o rewriter
      console.log(`[SearchWorker] Encontradas ${galleries.length} galerias.`);

      if (galleries.length === 0) {
        throw new Error("Nenhuma galeria encontrada. A estrutura do site pode ter mudado.");
      }

      // 5. Chamar o JobCoordinator para avançar o estado do job.
      const resultPayload = { raw_results: galleries };
      await jobCoordinatorStub.fetch(`http://do/job/${jobId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resultPayload),
      });

      console.log(`[SearchWorker] ✅ Sucesso! Reportado ao JobCoordinator para o job ${jobId}.`);
      return new Response(JSON.stringify({ success: true, jobId, found: galleries.length }));

    } catch (error: any) {
      console.error(`[SearchWorker] ❌ Erro: ${error.message}`);
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
