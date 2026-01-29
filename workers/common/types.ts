// workers/common/types.ts

/**
 * O Contrato de Job Canónico.
 * Esta é a única fonte da verdade para a estrutura de um job de publicação
 * em todo o ecossistema Gallyfans.
 */

// Representa o estado de um job no seu ciclo de vida.
export type JobStatus = 
  | 'pending'      // Criado pelo Intelligent Worker, aguardando processamento.
  | 'processing'   // Reivindicado pelo Content Worker, a ser enriquecido.
  | 'review'       // Enriquecido, aguardando direção/curadoria.
  | 'directing'    // Reivindicado pelo Director Worker, a ser finalizado.
  | 'ready'        // Finalizado e salvo no D1, pronto para entrega.
  | 'delivering'   // Reivindicado pelo Delivery Worker, a ser enviado ao Gateway.
  | 'published'    // Entregue com sucesso ao Gateway.
  | 'failed';      // Ocorreu um erro em qualquer uma das etapas.

// A estrutura final de um job pronto para ser publicado,
// conforme armazenado no D1 e enviado para o Delivery Worker.
export interface PublicationJob {
  // --- Identificação e Destino ---
  id: string; // UUID, chave primária no D1.
  targetGroupId: string; // JID do grupo/canal do WhatsApp.

  // --- Conteúdo ---
  caption: string;
  mediaUrls: string[]; // Array de URLs de imagem/vídeo.
  
  // --- Metadados Estratégicos ---
  affiliateLink?: string; // Link de afiliado (opcional).
  tags?: string[];
  source?: string; // Fonte do conteúdo (e.g., nome do site, ID da galeria).

  // --- Rastreamento do Ciclo de Vida ---
  status: JobStatus;
  attempts: number; // Número de tentativas de processamento/entrega.
  createdAt: string; // ISO 8601 timestamp.
  updatedAt: string; // ISO 8601 timestamp.
  error?: string; // Mensagem de erro em caso de falha.
}

/**
 * Interface para o Durable Object (JobCoordinator).
 * Representa a estrutura de um job enquanto está a ser construído,
 * antes de ser finalizado e salvo no D1.
 */
export interface CoordinatedJob {
  id: string;
  status: 'pending' | 'processing' | 'review' | 'directing' | 'complete' | 'failed';
  createdAt: string;
  updatedAt: string;
  
  // Dados iniciais do Intelligent Worker
  rules?: {
    niche: string;
    categories: string[];
    tags: string[];
    offerId?: string;
  };

  // Dados enriquecidos do Content Worker
  content?: {
    sourceUrl: string;
    images: string[]; // URLs das imagens
    modelBio?: string;
  };

  // Erros que podem ocorrer durante a coordenação
  error?: string;
}
