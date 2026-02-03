# Gallyfans - Ecossistema de Publicação Autônoma

**Gallyfans** é um sistema de automação para coleta, curadoria e publicação de conteúdo, construído sobre a plataforma Cloudflare Workers.

## Arquitetura do Pipeline

O sistema opera como um pipeline assíncrono, orquestrado por um Durable Object central (`JobCoordinator`), onde cada etapa é executada por um worker especializado e stateless.

**Fluxo de Execução:**

`Gatilho (Cron/Manual)` → `director-worker` → `JobCoordinator (D.O.)` ↴

| Etapa | Worker | Responsabilidade |
| :--- | :--- | :--- |
| 1. Search | → `SearchWorker` | Coleta dados brutos de fontes externas. |
| 2. Curate | → `CuratorWorker` | Filtra, enriquece e seleciona o melhor conteúdo. |
| 3. Publish | → `PublisherWorker`| Formata e entrega o conteúdo ao destino final. |

---

## Componentes

#### 1. `director-worker`
- **Função:** Ponto de Entrada / Gatilho.
- **Responsabilidade:** Inicia o pipeline. Recebe uma requisição (manual ou via cron) e instrui o `JobCoordinator` a criar um novo job.

#### 2. `JobCoordinator` (Durable Object)
- **Função:** Orquestrador de Estado (Stateful).
- **Responsabilidade:** É o cérebro do sistema. Gerencia o ciclo de vida completo de um job (`SEARCHING` → `CURATING` → `PUBLISHING` → `COMPLETED`/`FAILED`). Invoca cada worker em sequência e armazena o estado atual do job.

#### 3. `SearchWorker`
- **Função:** Coletor de Dados (Stateless).
- **Responsabilidade:** Recebe uma ordem do `JobCoordinator`, executa a coleta de dados (atualmente via web scraping) e devolve os "resultados brutos" (`raw_results`) para o coordenador.

#### 4. `CuratorWorker`
- **Função:** Editor de Conteúdo (Stateless).
- **Responsabilidade:** Recebe os `raw_results` do `JobCoordinator`, aplica regras de negócio para selecionar o melhor item, o enriquece (ex: gerando legendas) e devolve o "item curado" (`curated_item`) ao coordenador.

#### 5. `PublisherWorker`
- **Função:** Entregador Final (Stateless).
- **Responsabilidade:** Recebe o `curated_item` do `JobCoordinator`, formata-o para o canal de destino e realiza a publicação.

---

## Estado Atual do Projeto

- ✅ **`JobCoordinator`**: Implementado como uma máquina de estados funcional.
- ✅ **`director-worker`**: Implementado e integrado para iniciar jobs no `JobCoordinator`.
- ✅ **`SearchWorker`**: Implementado com lógica de web scraping via `HTMLRewriter` e integrado ao `JobCoordinator`.
- 🚧 **`CuratorWorker` / `PublisherWorker`**: Aguardando implementação.

O fluxo autônomo atual vai do `director-worker` até a conclusão do `SearchWorker`, com o `JobCoordinator` transicionando o estado do job para `CURATING`.

## Deploy

O deploy é automatizado via GitHub Actions, configurado em `.github/workflows/deploy-workers.yml`. Cada push para o branch `main` dispara o deploy dos workers configurados.