-- Migration para criar a tabela de eventos do sistema
CREATE TABLE IF NOT EXISTS system_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    workerName TEXT NOT NULL,
    jobId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    details TEXT -- JSON string para detalhes flexíveis
);
