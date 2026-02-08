// src/workers/status-worker/src/index.ts

// É necessário exportar o DO para o wrangler encontrá-lo, mesmo que este worker não seja o "dono" dele.
export { JobCoordinator } from '../../durable-objects/JobCoordinator.js';

export interface Env {
  DB: D1Database; // Banco D1 para logs e métricas
  JOB_COORDINATOR: DurableObjectNamespace;
  ALERT_WEBHOOK_URL: string; // Webhook para alertas
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const method = request.method;

    // --- Helpers ---
    async function logEvent(workerName: string, jobId: string, eventType: string, details: any) {
      const log = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        workerName,
        jobId,
        eventType,
        details,
      };
      await env.DB.prepare(
        `INSERT INTO system_events (id, timestamp, workerName, jobId, eventType, details)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(log.id, log.timestamp, log.workerName, log.jobId, log.eventType, JSON.stringify(log.details))
      .run();
      return log;
    }

    async function aggregateMetrics() {
      // Contabiliza eventos recentes
      const results = await env.DB.prepare(`
        SELECT eventType, COUNT(*) as count
        FROM system_events
        WHERE timestamp >= datetime('now', '-1 hour')
        GROUP BY eventType
      `).all();
      return results.results;
    }

    async function sendAlert(message: string) {
      // Exemplo: enviar alertas para Telegram, Discord ou webhook
      if (env.ALERT_WEBHOOK_URL && env.ALERT_WEBHOOK_URL.startsWith('http')) {
        await fetch(env.ALERT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message }) // 'content' é comum para Discord
        });
      }
    }

    async function applyIASuggestion(suggestion: any, jobId: string) {
      // Sugestão da IA é opcional
      console.log("[StatusWorker] Sugestão da IA recebida:", suggestion);

      if (!suggestion) return;

      // Exemplo de ações automáticas
      if (suggestion.retry) {
        console.log(`[StatusWorker] Reprocessando job ${jobId} por sugestão da IA`);
        const doId = env.JOB_COORDINATOR.idFromName("singleton_job_coordinator");
        const coordinatorStub = env.JOB_COORDINATOR.get(doId);
        await coordinatorStub.fetch(`http://do/job/${jobId}/advance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ retry: true })
        });
      }

      if (suggestion.priority) {
        // Log ou notifica prioridade alterada
        await sendAlert(`Job ${jobId} marcado como prioridade: ${suggestion.priority}`);
      }
    }

    try {
      if (method === "POST") {
        const payload = await request.json();
        const { workerName, jobId, eventType, details } = payload;

        if (!workerName || !jobId || !eventType) {
          return new Response(JSON.stringify({ success: false, error: "Parâmetros obrigatórios faltando" }), { status: 400 });
        }

        const log = await logEvent(workerName, jobId, eventType, details);

        if (eventType.includes('FAILED')) {
            await sendAlert(`🚨 **ALERTA DE FALHA** 🚨\n- **Worker:** ${workerName}\n- **Job ID:** ${jobId}\n- **Erro:** ${details?.error || 'Não especificado'}`);
        }

        if (details?.iaSuggestion) {
          ctx.waitUntil(applyIASuggestion(details.iaSuggestion, jobId));
        }

        return new Response(JSON.stringify({ success: true, log }), { status: 201 });
      }

      if (method === "GET") {
        const query = url.searchParams.get("metrics") === "true";

        if (query) {
          const metrics = await aggregateMetrics();
          return new Response(JSON.stringify({ success: true, metrics }), { status: 200 });
        }

        // Retorna logs recentes
        const logs = await env.DB.prepare(`SELECT * FROM system_events ORDER BY timestamp DESC LIMIT 50`).all();
        return new Response(JSON.stringify({ success: true, logs: logs.results }), { status: 200 });
      }

      return new Response("Método não permitido", { status: 405 });
    } catch (err: any) {
      console.error("[StatusWorker] Erro:", err);
      ctx.waitUntil(sendAlert(`[StatusWorker] Erro crítico: ${err.message}`));
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
    }
  }
};