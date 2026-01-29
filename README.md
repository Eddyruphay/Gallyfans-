# Gallyfans - Ecossistema Gally

**Status:** Arquitetura de Workers Distribuídos  
**Objetivo:** Publicação autônoma e estratégica de conteúdo em grupos de WhatsApp, dentro do ecossistema Gally.

**Gallyfans** é parte do **Ecossistema Gally**, focado em entregar conteúdo de alto valor através de um sistema de automação resiliente, escalável e orientado por dados.

---

## 1. Estratégia de Armazenamento

A arquitetura utiliza uma combinação de serviços de armazenamento da Cloudflare, cada um com uma responsabilidade clara:

- **D1 (Memória Estratégica):** Nossa base de dados relacional (SQLite) e fonte da verdade para dados de longo prazo.
  - Armazena o histórico de `publication_jobs`.
  - Guarda eventos do WhatsApp, métricas de performance e dados para análise estratégica.

- **Durable Objects (Coordenação Viva):** O cérebro da orquestração do ciclo de vida de um job.
  - Garante que cada job seja processado em ordem e sem duplicidade (atomicidade).
  - Mantém o estado de um job *enquanto ele está a ser construído* (`pending`, `processing`, `review`).

- **KV (Memória Operacional):** Um cache global de leitura rápida.
  - Usado para dados de acesso frequente e que mudam pouco, como configurações, URLs de serviços ou "listas do dia". Não é uma fonte da verdade.

---

## 2. O Gateway (Executor)

**Localização:** `gateway/`  
**Executor:** Termux Client (`client.ts`)

O Gateway é o único componente com acesso direto ao WhatsApp. A sua função é simples e focada: **executar, não decidir**.

- **Responsabilidades:**
  - Manter a sessão do WhatsApp (`session/`).
  - Expor um endpoint `POST /publish` seguro e autenticado (`X-Auth-Token`).
  - Receber um job contendo `jid`, `caption` e um array de **buffers de imagem**.
  - Enviar as mídias para o WhatsApp.
- **Princípio Chave:** O Gateway é "burro". Ele não conhece o `Job Contract`, não tem lógica de negócio e não lida com URLs. Ele apenas publica o que lhe é entregue.

---

## 3. O Ciclo de Vida de um Job (Workers)

O coração do sistema é um pipeline assíncrono executado por quatro workers especializados. O fluxo é orquestrado pelo `JobCoordinator` (Durable Object) e utiliza o `PublicationJob` como contrato de dados formal.

### 3.1 Intelligent Worker
- **Localização:** `workers/intelligent-worker/`
- **Input:** Métricas e dados estratégicos do **D1**.
- **Processo:** Analisa a performance de conteúdos passados, tendências e regras de negócio. Decide qual o "tipo" de conteúdo a ser criado.
- **Output:** Cria um `CoordinatedJob` inicial com o status `pending` no **Durable Object**. Este job contém as "regras" para o próximo conteúdo (e.g., nicho, tags, oferta).

### 3.2 Content Worker
- **Localização:** `workers/content-worker/`
- **Input:** Reivindica um job `pending` do **Durable Object**.
- **Processo:** Com base nas regras do job, busca o conteúdo em fontes externas (APIs, scraping).
- **Output:** Atualiza o `CoordinatedJob` no **Durable Object** com os metadados encontrados (URLs das imagens, bio do modelo, etc.) e altera o seu status para `review`.

### 3.3 Director Worker
- **Localização:** `workers/director-worker/`
- **Input:** Reivindica um job `review` do **Durable Object**.
- **Processo:** Valida o conteúdo, aplica a curadoria final e gera a legenda (`caption`) definitiva, combinando todos os dados.
- **Output:** Cria um `PublicationJob` final e **salva-o no D1** com o status `ready`. Em seguida, notifica o **Durable Object** que o trabalho de coordenação está `complete`.

### 3.4 Delivery Worker
- **Localização:** `workers/delivery-worker/`
- **Input:** Consulta o **D1** por jobs com status `ready`.
- **Processo (O Trabalho Pesado):**
  1. Reivindica um job `ready` e muda o seu status para `delivering`.
  2. Baixa todas as imagens das `mediaUrls` em paralelo.
  3. Converte as imagens para buffers.
  4. Monta um `FormData` com os buffers, `caption` e `targetGroupId`.
- **Output:** Envia o `FormData` para o endpoint `/publish` do **Gateway**. Se a entrega for bem-sucedida, atualiza o status do job no **D1** para `published`. Se falhar, para `failed`.

---

## 4. Regras de Operação

1. **Contrato é Rei:** Todos os componentes comunicam através das interfaces `PublicationJob` e `CoordinatedJob`.
2. **Workers não se conhecem:** Cada worker conhece apenas a sua fonte de dados (D1 ou DO) e o seu destino, garantindo baixo acoplamento.
3. **Gateway é Isolado:** A única porta de entrada para o WhatsApp é o Gateway, e a sua API é simples e segura.
4. **Resiliência por Design:** A separação de responsabilidades e o armazenamento de estado no D1/DO permitem que o sistema recupere de falhas em qualquer etapa do pipeline.