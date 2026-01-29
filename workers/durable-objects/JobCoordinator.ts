// src/durable-objects/JobCoordinator.ts

import { CoordinatedJob } from '../common/types.js';

// Constantes para os nomes de armazenamento dos índices
const PENDING_JOBS_KEY = 'index_pending_jobs';
const REVIEW_JOBS_KEY = 'index_review_jobs';

export class JobCoordinator {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  // Método interno para buscar um índice (lista de IDs)
  private async getIndex(key: string): Promise<string[]> {
    return (await this.state.storage.get<string[]>(key)) || [];
  }

  // Método interno para salvar um índice
  private async saveIndex(key: string, index: string[]): Promise<void> {
    await this.state.storage.put(key, index);
  }

  // Cria um novo job e o adiciona ao índice de 'pending'
  async createJob(jobData: Partial<CoordinatedJob>): Promise<CoordinatedJob> {
    const job: CoordinatedJob = {
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...jobData,
    };

    await this.state.storage.put(`job:${job.id}`, job);

    const pendingIndex = await this.getIndex(PENDING_JOBS_KEY);
    pendingIndex.push(job.id);
    await this.saveIndex(PENDING_JOBS_KEY, pendingIndex);

    return job;
  }

  // Pega o próximo job pendente, o remove do índice 'pending' e atualiza seu status para 'processing'
  // Esta operação é atômica para uma instância de DO, prevenindo race conditions.
  async claimNextPendingJob(): Promise<CoordinatedJob | null> {
    const pendingIndex = await this.getIndex(PENDING_JOBS_KEY);
    if (pendingIndex.length === 0) {
      return null; // Nenhum job pendente
    }

    const jobId = pendingIndex.shift()!; // Pega o primeiro ID
    await this.saveIndex(PENDING_JOBS_KEY, pendingIndex); // Salva o índice modificado

    const job = await this.state.storage.get<CoordinatedJob>(`job:${jobId}`);
    if (!job) return null; // Job não encontrado, embora estivesse no índice (caso raro)

    job.status = 'processing';
    job.updatedAt = new Date().toISOString();
    await this.state.storage.put(`job:${job.id}`, job);

    return job;
  }
  
  // Pega o próximo job em revisão, o remove do índice 'review' e atualiza seu status para 'directing'
  async claimNextReviewJob(): Promise<CoordinatedJob | null> {
    const reviewIndex = await this.getIndex(REVIEW_JOBS_KEY);
    if (reviewIndex.length === 0) {
      return null;
    }

    const jobId = reviewIndex.shift()!;
    await this.saveIndex(REVIEW_JOBS_KEY, reviewIndex);

    const job = await this.state.storage.get<CoordinatedJob>(`job:${jobId}`);
    if (!job) return null;

    job.status = 'directing';
    job.updatedAt = new Date().toISOString();
    await this.state.storage.put(`job:${job.id}`, job);

    return job;
  }

  // Atualiza um job com novos dados (usado pelo Content Worker) e o move para o índice 'review'
  async updateJobWithContent(id: string, content: CoordinatedJob['content']): Promise<void> {
    const job = await this.state.storage.get<CoordinatedJob>(`job:${id}`);
    if (!job) throw new Error('Job not found');

    job.content = content;
    job.status = 'review';
    job.updatedAt = new Date().toISOString();
    await this.state.storage.put(`job:${id}`, job);

    const reviewIndex = await this.getIndex(REVIEW_JOBS_KEY);
    reviewIndex.push(id);
    await this.saveIndex(REVIEW_JOBS_KEY, reviewIndex);
  }
  
  // Marca um job como finalizado (usado pelo Director Worker após salvar no D1)
  async completeJob(id: string): Promise<void> {
    const job = await this.state.storage.get<CoordinatedJob>(`job:${id}`);
    if (!job) return;

    job.status = 'complete';
    job.updatedAt = new Date().toISOString();
    await this.state.storage.put(`job:${id}`, job);
  }

  // Ponto de entrada para interações via HTTP com os workers
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Worker Inteligente -> POST /jobs (cria um novo job)
    if (path === '/jobs' && method === 'POST') {
      const jobData = await request.json<Partial<CoordinatedJob>>();
      const job = await this.createJob(jobData);
      return new Response(JSON.stringify(job), { status: 201 });
    }

    // Worker de Conteúdo -> POST /jobs/claim-pending (pega o próximo job pendente)
    if (path === '/jobs/claim-pending' && method === 'POST') {
      const job = await this.claimNextPendingJob();
      if (job) {
        return new Response(JSON.stringify(job));
      }
      return new Response('No pending jobs', { status: 404 });
    }

    // Worker de Conteúdo -> PUT /jobs/:id/content (adiciona conteúdo a um job)
    if (path.match(/^\/jobs\/[a-f0-9-]+\/content$/) && method === 'PUT') {
        const id = path.split('/')[2];
        const content = await request.json<CoordinatedJob['content']>();
        await this.updateJobWithContent(id, content);
        return new Response(JSON.stringify({ id, status: 'review' }));
    }

    // Worker Diretor -> POST /jobs/claim-review (pega o próximo job em revisão)
    if (path === '/jobs/claim-review' && method === 'POST') {
        const job = await this.claimNextReviewJob();
        if (job) {
            return new Response(JSON.stringify(job));
        }
        return new Response('No jobs to review', { status: 404 });
    }
    
    // Worker Diretor -> POST /jobs/:id/complete (marca um job como completo)
    if (path.match(/^\/jobs\/[a-f0-9-]+\/complete$/) && method === 'POST') {
        const id = path.split('/')[2];
        await this.completeJob(id);
        return new Response(JSON.stringify({ id, status: 'complete' }));
    }

    return new Response('Not found', { status: 404 });
  }
}
