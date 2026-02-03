// workers/durable-objects/JobCoordinator.ts

import { CoordinatedJob, JobState, PublicationJob } from '../common/types.js';

interface Env {
  DB: D1Database;
  SEARCH_WORKER: Fetcher;
  CURATOR_WORKER: Fetcher;
  CONTENT_WORKER: Fetcher;
}

export class JobCoordinator {
  state: DurableObjectState;
  env: Env;
  private job: CoordinatedJob | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    console.log(`[JobCoordinator DO ${this.state.id}] Inicializado.`);
  }

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

  private async saveJob(): Promise<void> {
    if (this.job) {
      this.job.updatedAt = new Date().toISOString();
      await this.state.storage.put('job', this.job);
      console.log(`[JobCoordinator DO ${this.job.id}] Job salvo. Estado: ${this.job.state}`);
    } else {
      console.error(`[JobCoordinator DO ${this.state.id}] Tentativa de salvar job nulo.`);
    }
  }

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
      initialPayload: initialPayload, // Salva o payload inicial
      currentPayload: initialPayload,
    };
    await this.saveJob();
    console.log(`[JobCoordinator DO ${this.job.id}] Job iniciado. Estado: ${this.job.state}.`);
    
    this.invokeSearchWorker();
    return jobId;
  }

  private async invokeWorker(worker: Fetcher, workerName: string, payload: any): Promise<void> {
    if (!this.job) return;
    
    console.log(`[JobCoordinator DO ${this.job.id}] Invocando ${workerName}...`);
    try {
      worker.fetch(`http://${workerName.toLowerCase()}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e: any) {
      const errorMessage = `Falha ao invocar ${workerName}: ${e.message}`;
      console.error(`[JobCoordinator DO ${this.job?.id}] ${errorMessage}`);
      await this.failJob(this.job.id, errorMessage);
    }
  }

  private invokeSearchWorker(): Promise<void> {
    return this.invokeWorker(this.env.SEARCH_WORKER, 'SearchWorker', {
      jobId: this.job!.id,
      currentPayload: this.job!.currentPayload,
    });
  }

  private invokeCuratorWorker(): Promise<void> {
    return this.invokeWorker(this.env.CURATOR_WORKER, 'CuratorWorker', {
      jobId: this.job!.id,
      currentPayload: this.job!.currentPayload,
    });
  }

  private invokeContentWorker(): Promise<void> {
    return this.invokeWorker(this.env.CONTENT_WORKER, 'ContentWorker', {
      jobId: this.job!.id,
      currentPayload: this.job!.currentPayload,
    });
  }

  private async saveFinalJobToDB(): Promise<void> {
    if (!this.job || !this.job.currentPayload.final_item) {
      throw new Error("Payload final ausente ou inválido para salvar no DB.");
    }
    console.log(`[JobCoordinator DO ${this.job.id}] Salvando job final no banco de dados...`);

    const { final_item } = this.job.currentPayload;
    const { targetGroupId } = this.job.initialPayload;

    if (!targetGroupId) {
      throw new Error("`targetGroupId` não encontrado no payload inicial do job.");
    }

    const publicationJob: PublicationJob = {
      id: crypto.randomUUID(),
      targetGroupId: targetGroupId,
      caption: final_item.generated_caption,
      mediaUrls: [final_item.image_url],
      source: final_item.source_url,
      status: 'ready',
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.env.DB.prepare(
      `INSERT INTO publication_jobs (id, targetGroupId, caption, mediaUrls, source, status, attempts, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      publicationJob.id,
      publicationJob.targetGroupId,
      publicationJob.caption,
      JSON.stringify(publicationJob.mediaUrls), // Salva o array como string JSON
      publicationJob.source,
      publicationJob.status,
      publicationJob.attempts,
      publicationJob.createdAt,
      publicationJob.updatedAt
    ).run();

    console.log(`[JobCoordinator DO ${this.job.id}] Job ${publicationJob.id} salvo no D1 com status 'ready'.`);
  }

  async advanceState(jobId: string, resultPayload: any): Promise<void> {
    await this.loadJob();
    if (!this.job || this.job.id !== jobId) {
      throw new Error(`Job ${jobId} não encontrado ou incompatível para advanceState.`);
    }

    let nextState: JobState;
    let subsequentAction: (() => Promise<void>) | null = null;

    switch (this.job.state) {
      case JobState.SEARCHING:
        nextState = JobState.CURATING;
        subsequentAction = () => this.invokeCuratorWorker();
        break;
      case JobState.CURATING:
        nextState = JobState.CONTENT_GENERATION;
        subsequentAction = () => this.invokeContentWorker();
        break;
      case JobState.CONTENT_GENERATION:
        nextState = JobState.SAVING;
        subsequentAction = () => this.saveFinalJobToDB();
        break;
      case JobState.SAVING:
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

    if (subsequentAction) {
      await subsequentAction();
      // Se a ação foi salvar, avançamos imediatamente para COMPLETED
      if (this.job.state === JobState.SAVING) {
        await this.advanceState(jobId, { success: true, message: `Job saved to DB` });
      }
    }
  }

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

