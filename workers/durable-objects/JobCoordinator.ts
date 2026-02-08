// workers/durable-objects/JobCoordinator.ts

import { Toucan } from 'toucan-js';
import { CoordinatedJob, JobState, PublicationJob } from '../common/types.js';

interface Env {
  DB: D1Database;
  SEARCH_WORKER: Fetcher;
  CURATOR_WORKER: Fetcher;
  CONTENT_WORKER: Fetcher;
  SENTRY_DSN: string; // Adicionar SENTRY_DSN
}

export class JobCoordinator {
  state: DurableObjectState;
  env: Env;
  private job: CoordinatedJob | null = null;
  private toucan: Toucan;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.toucan = new Toucan({
      dsn: env.SENTRY_DSN,
      context: state, // O contexto para DOs é o estado
    });
    console.log(`[JobCoordinator DO ${this.state.id}] Inicializado.`);
  }

  private async loadJob(): Promise<void> {
    if (!this.job) {
      this.job = await this.state.storage.get<CoordinatedJob>('job');
      if (this.job) {
        console.log(`[JobCoordinator DO ${this.job.id}] Job carregado. Estado: ${this.job.state}`);
        this.toucan.setTag('job_id', this.job.id);
        this.toucan.setContext('job_details', this.job);
        this.toucan.addBreadcrumb({ message: `Job ${this.job.id} carregado do storage.`, category: 'job_lifecycle' });
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
      this.toucan.addBreadcrumb({ message: `Job ${this.job.id} salvo no storage. Estado: ${this.job.state}`, category: 'job_lifecycle' });
    } else {
      console.error(`[JobCoordinator DO ${this.state.id}] Tentativa de salvar job nulo.`);
      this.toucan.captureException(new Error("Tentativa de salvar job nulo."));
    }
  }

  async startJob(initialPayload: any): Promise<string> {
    await this.loadJob();
    if (this.job && this.job.state !== JobState.COMPLETED && this.job.state !== JobState.FAILED) {
      const warningMessage = `Tentativa de iniciar um novo job enquanto outro está ativo (${this.job.state}).`;
      console.warn(`[JobCoordinator DO ${this.job.id}] ${warningMessage}`);
      this.toucan.addBreadcrumb({ message: warningMessage, level: 'warning' });
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
    this.toucan.setTag('job_id', this.job.id);
    this.toucan.setContext('job_details', this.job);
    this.toucan.addBreadcrumb({ message: `Job ${this.job.id} iniciado. Estado: ${this.job.state}.`, category: 'job_lifecycle' });
    console.log(`[JobCoordinator DO ${this.job.id}] Job iniciado. Estado: ${this.job.state}.`);
    
    this.invokeSearchWorker();
    return jobId;
  }

  private async invokeWorker(worker: Fetcher, workerName: string, payload: any): Promise<void> {
    if (!this.job) return;
    
    console.log(`[JobCoordinator DO ${this.job.id}] Invocando ${workerName}...`);
    this.toucan.addBreadcrumb({ message: `Invocando worker: ${workerName}`, category: 'worker_invocation' });
    try {
      worker.fetch(`http://${workerName.toLowerCase()}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e: any) {
      const errorMessage = `Falha ao invocar ${workerName}: ${e.message}`;
      console.error(`[JobCoordinator DO ${this.job?.id}] ${errorMessage}`);
      this.toucan.captureException(e);
      await this.failJob(this.job.id, errorMessage);
    }
  }

  private invokeSearchWorker(): Promise<void> {
    // currentPayload deve conter o 'channel' do initialPayload
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
      const errorMessage = "Payload final ausente ou inválido para salvar no DB.";
      this.toucan.captureException(new Error(errorMessage));
      throw new Error(errorMessage);
    }
    console.log(`[JobCoordinator DO ${this.job.id}] Salvando job final no banco de dados...`);
    this.toucan.addBreadcrumb({ message: 'Salvando job final no D1.', category: 'database_operation' });

    const { final_item } = this.job.currentPayload;
    // initialPayload deve conter o targetGroupId
    const { targetGroupId } = this.job.initialPayload;

    if (!targetGroupId) {
      const errorMessage = "`targetGroupId` não encontrado no payload inicial do job.";
      this.toucan.captureException(new Error(errorMessage));
      throw new Error(errorMessage);
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

    try {
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
      this.toucan.addBreadcrumb({ message: `Job ${publicationJob.id} salvo no D1 com status 'ready'.`, category: 'database_operation' });
      console.log(`[JobCoordinator DO ${this.job.id}] Job ${publicationJob.id} salvo no D1 com status 'ready'.`);
    } catch (e: any) {
      this.toucan.captureException(e);
      throw e;
    }
  }

  async advanceState(jobId: string, resultPayload: any): Promise<void> {
    await this.loadJob();
    if (!this.job || this.job.id !== jobId) {
      const errorMessage = `Job ${jobId} não encontrado ou incompatível para advanceState.`;
      this.toucan.captureException(new Error(errorMessage));
      throw new Error(errorMessage);
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
        this.toucan.captureException(new Error(errorMessage));
        throw new Error(errorMessage);
    }

    this.job.state = nextState;
    this.job.currentPayload = resultPayload;
    await this.saveJob();
    this.toucan.addBreadcrumb({ message: `Estado do job ${jobId} avançado para: ${nextState}.`, category: 'job_lifecycle' });
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
      const err = new Error(`Job ${jobId} não encontrado ou incompatível para failJob.`);
      this.toucan.captureException(err);
      throw err;
    }

    this.job.state = JobState.FAILED;
    this.job.error = errorMessage;
    await this.saveJob();
    this.toucan.addBreadcrumb({ message: `Job ${jobId} FALHOU.`, level: 'error', data: { errorMessage } });
    this.toucan.captureException(new Error(errorMessage)); // Captura a falha do job como uma exceção no Sentry
    console.error(`[JobCoordinator DO ${jobId}] Job FALHOU. Erro: ${errorMessage}`);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const jobIdMatch = path.match(/^\/job\/([a-f0-9-]+)\/?(.*)$/);
    const jobId = jobIdMatch ? jobIdMatch[1] : undefined;
    const action = jobIdMatch ? jobIdMatch[2] : path.substring(1);

    this.toucan.setContext('request_path', path);
    this.toucan.setContext('request_method', method);
    if (jobId) {
      this.toucan.setTag('job_id', jobId);
    }

    try {
      switch (method) {
        case 'POST':
          if (action === 'job/start') {
            const initialPayload = await request.json().catch(() => ({}));
            this.toucan.addBreadcrumb({ message: 'Recebida requisição para iniciar job.', category: 'fetch_handler', data: initialPayload });
            const newJobId = await this.startJob(initialPayload);
            return new Response(JSON.stringify({ jobId: newJobId, state: JobState.SEARCHING }), { status: 201 });
          } else if (jobId) {
            const payload = await request.json().catch(() => ({}));
            if (action === 'advance') {
              this.toucan.addBreadcrumb({ message: `Recebida requisição para avançar estado do job ${jobId}.`, category: 'fetch_handler', data: payload });
              await this.advanceState(jobId, payload);
              return new Response(JSON.stringify({ jobId, state: this.job?.state }), { status: 200 });
            } else if (action === 'fail') {
              const { error } = payload;
              if (!error) {
                const err = new Error("Mensagem de erro necessária para a ação 'fail'.");
                this.toucan.captureException(err);
                throw err;
              }
              this.toucan.addBreadcrumb({ message: `Recebida requisição para falhar job ${jobId}.`, category: 'fetch_handler', level: 'error', data: { error } });
              await this.failJob(jobId, error);
              return new Response(JSON.stringify({ jobId, state: JobState.FAILED, error }), { status: 200 });
            }
          }
          break;
        case 'GET':
          if (jobId && action === '') {
            this.toucan.addBreadcrumb({ message: `Recebida requisição para obter job ${jobId}.`, category: 'fetch_handler' });
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
      this.toucan.captureException(e);
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }
}


