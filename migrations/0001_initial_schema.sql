-- migrations/0001_initial_schema.sql

-- Tabela para armazenar eventos do WhatsApp, métricas e dados estratégicos
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT -- JSON string para detalhes do evento
);

-- Tabela para armazenar jobs de publicação finalizados e prontos para o ciclo de entrega
-- Esta tabela é a fonte da verdade para o 'Delivery Worker'.
CREATE TABLE IF NOT EXISTS publication_jobs (
    -- Identificação e Destino
    id TEXT PRIMARY KEY,
    targetGroupId TEXT NOT NULL,

    -- Conteúdo
    caption TEXT NOT NULL,
    mediaUrls TEXT NOT NULL, -- Armazenado como uma string JSON de um array de URLs

    -- Metadados Estratégicos
    affiliateLink TEXT,
    tags TEXT, -- Armazenado como uma string JSON de um array de tags
    source TEXT,

    -- Rastreamento do Ciclo de Vida
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    
    -- Timestamps
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
);
