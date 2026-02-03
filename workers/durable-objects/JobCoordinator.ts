// workers/durable-objects/JobCoordinator.ts

import { CoordinatedJob, JobState } from '../common/types.js';

interface Env {
  SEARCH_WORKER: Fetcher;
}

export class JobCoordinator {
  state: DurableObjectState;
  env: Env;
  private job: CoordinatedJob | null = null; // Cache em memória para o job atual

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    console.log(`[JobCoordinator DO ${this.state.id}] Inicializado.`);
  }

  // Helper para carregar o job do storage
  private async loadJob(): Promise<void> {
    if (!this.job) {
      this.job = await this.state.storage.get<CoordinatedJob>('job');
      if (this.job) {
        console.log(`[JobCoordinator DO ${this.job.id}] Job carregado. Estado: ${this.job.state}`);
      } else {
        console.log(`[JobCoordinator DO ${this.state.id}] Nenhum job ativo encontrado no storage.`);
      }
    }
  }

  // Helper para salvar o job no storage
  private async saveJob(): Promise<void> {
    if (this.job) {
      this.job.updatedAt = new Date().toISOString();
      await this.state.storage.put('job', this.job);
      console.log(`[JobCoordinator DO ${this.job.id}] Job salvo. Estado: ${this.job.state}`);
    } else {
      console.error(`[JobCoordinator DO ${this.state.id}] Tentativa de salvar job nulo.`);
    }
  }

  /**
   * Inicializa um novo job, transita para SEARCHING e invoca o SearchWorker.
   */
  async startJob(initialPayload: any): Promise<string> {
    await this.loadJob();
    if (this.job && this.job.state !== JobState.COMPLETED && this.job.state !== JobState.FAILED) {
      console.warn(`[JobCoordinator DO ${this.job.id}] Tentativa de iniciar um novo job enquanto outro está ativo (${this.job.state}).`);
    }

    const jobId = crypto.randomUUID();
    this.job = {
      id: jobId,
      state: JobState.SEARCHING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentPayload: initialPayload,
    };
    await this.saveJob();
    console.log(`[JobCoordinator DO ${this.job.id}] Job iniciado. Estado: ${this.job.state}.`);

    // Invoca o SearchWorker de forma assíncrona
    this.invokeSearchWorker();

    return jobId;
  }

  /**
   * Invoca o SearchWorker para iniciar o processo de busca.
   */
  private async invokeSearchWorker(): Promise<void> {
    if (!this.job) return;
    
    console.log(`[JobCoordinator DO ${this.job.id}] Invocando SearchWorker...`);
    try {
      const searchWorkerPayload = {
        jobId: this.job.id,
        currentPayload: this.job.currentPayload,
      };

      // Não precisamos esperar a resposta aqui. O SearchWorker se reportará de volta.
      // O 'fetch' para outro worker retorna imediatamente. A execução continua em background.
      this.env.SEARCH_WORKER.fetch('http://search-worker/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchWorkerPayload),
      });

    } catch (e: any) {
      console.error(`[JobCoordinator DO ${this.job?.id}] Falha ao invocar SearchWorker: ${e.message}`);
      await this.failJob(this.job.id, `Falha ao invocar SearchWorker: ${e.message}`);
    }
  }

  /**
   * Avança o job para o próximo estado.
   */
  async advanceState(jobId: string, resultPayload: any): Promise<void> {
    await this.loadJob();
    if (!this.job || this.job.id !== jobId) {
      throw new Error(`Job ${jobId} não encontrado ou incompatível para advanceState.`);
    }

    let nextState: JobState;
    switch (this.job.state) {
      case JobState.SEARCHING:
        nextState = JobState.CURATING;
        break;
      case JobState.CURATING:
        nextState = JobState.PUBLISHING;
        break;
      case JobState.PUBLISHING:
        nextState = JobState.COMPLETED;
        break;
      default:
        const errorMessage = `Estado inválido para avanço: ${this.job.state}`;
        await this.failJob(jobId, errorMessage);
        throw new Error(errorMessage);
    }

    this.job.state = nextState;
    this.job.currentPayload = resultPayload;
    await this.saveJob();
    console.log(`[JobCoordinator DO ${jobId}] Estado avançado para: ${nextState}.`);
  }

  /**
   * Marca o job como falhado.
   */
  async failJob(jobId: string, errorMessage: string): Promise<void> {
    await this.loadJob();
    if (!this.job || this.job.id !== jobId) {
      throw new Error(`Job ${jobId} não encontrado ou incompatível para failJob.`);
    }

    this.job.state = JobState.FAILED;
    this.job.error = errorMessage;
    await this.saveJob();
    console.error(`[JobCoordinator DO ${jobId}] Job FALHOU. Erro: ${errorMessage}`);
  }

  /**
   * Recupera o estado atual de um job.
   */
  async getJob(jobId: string): Promise<CoordinatedJob | null> {
    await this.loadJob();
    if (this.job && this.job.id === jobId) {
      return this.job;
    }
    return null;
  }

  // --- HTTP Request Handler ---
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const jobIdMatch = path.match(/^\/job\/([a-f0-9-]+)\/?(.*)$/);
    const jobId = jobIdMatch ? jobIdMatch[1] : undefined;
    const action = jobIdMatch ? jobIdMatch[2] : path.substring(1);

    try {
      switch (method) {
        case 'POST':
          if (action === 'job/start') {
            const initialPayload = await request.json().catch(() => ({}));
            const newJobId = await this.startJob(initialPayload);
            return new Response(JSON.stringify({ jobId: newJobId, state: JobState.SEARCHING }), { status: 201 });
          } else if (jobId) {
            const payload = await request.json().catch(() => ({}));
            if (action === 'advance') {
              await this.advanceState(jobId, payload);
              return new Response(JSON.stringify({ jobId, state: this.job?.state }), { status: 200 });
            } else if (action === 'fail') {
              const { error } = payload;
              if (!error) throw new Error("Mensagem de erro necessária para a ação 'fail'.");
              await this.failJob(jobId, error);
              return new Response(JSON.stringify({ jobId, state: JobState.FAILED, error }), { status: 200 });
            }
          }
          break;
        case 'GET':
          if (jobId && action === '') {
            const job = await this.getJob(jobId);
            if (job) {
              return new Response(JSON.stringify(job), { status: 200 });
            }
            return new Response('Job não encontrado', { status: 404 });
          }
          break;
      }
      return new Response('Não encontrado ou método não permitido', { status: 404 });
    } catch (e: any) {
      console.error(`[JobCoordinator DO ${jobId || 'UNKNOWN'}] Erro no handler fetch:`, e.message);
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }
}
