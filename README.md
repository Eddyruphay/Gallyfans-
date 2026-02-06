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
| 3. Generate | → `ContentWorker`| Gera conteúdo adicional (ex: legendas) para o item. |
| 4. Save | → `JobCoordinator`| Persiste o job final no banco de dados (D1). |

---

## Componentes

#### 1. `director-worker`
- **Função:** Ponto de Entrada / Gatilho.
- **Responsabilidade:** Inicia o pipeline. Recebe uma requisição (manual ou via cron) e instrui o `JobCoordinator` a criar um novo job.

#### 2. `JobCoordinator` (Durable Object)
- **Função:** Orquestrador de Estado (Stateful).
- **Responsabilidade:** É o cérebro do sistema. Gerencia o ciclo de vida completo de um job (`SEARCHING` → `CURATING` → `CONTENT_GENERATION` → `SAVING` → `COMPLETED`/`FAILED`). Invoca cada worker em sequência e, ao final, salva o resultado no banco de dados.

#### 3. `SearchWorker`
- **Função:** Coletor de Dados (Stateless).
- **Responsabilidade:** Recebe uma ordem do `JobCoordinator`, executa a coleta de dados (atualmente via web scraping) e devolve os "resultados brutos" (`raw_results`) para o coordenador.

#### 4. `CuratorWorker`
- **Função:** Editor de Conteúdo (Stateless).
- **Responsabilidade:** Recebe os `raw_results` do `JobCoordinator`, aplica regras de negócio para selecionar o melhor item, e devolve o "item selecionado" (`selected_item`) ao coordenador.

#### 5. `ContentWorker`
- **Função:** Gerador de Conteúdo (Stateless).
- **Responsabilidade:** Recebe o `selected_item` do `JobCoordinator`, o enriquece (ex: gerando legendas com IA) e devolve o "item final" (`final_item`) ao coordenador.

---

## Estado Atual do Projeto

- ✅ **`JobCoordinator`**: Implementado como uma máquina de estados funcional, incluindo a lógica para invocar todos os workers e salvar no DB.
- ✅ **`director-worker`**: Implementado e integrado para iniciar jobs no `JobCoordinator`.
- ✅ **`SearchWorker`**: Implementado com lógica de web scraping via `HTMLRewriter`.
- ✅ **`CuratorWorker`**: Implementado com lógica de seleção simplificada.
- 🚧 **`ContentWorker`**: Aguardando implementação.

O fluxo autônomo atual vai do `director-worker` até a conclusão do `CuratorWorker`, com o `JobCoordinator` transicionando o estado do job para `CONTENT_GENERATION`.

## Deploy

O deploy é automatizado via GitHub Actions, configurado em `.github/workflows/deploy-workers.yml`. Cada push para o branch `main` dispara o deploy dos workers configurados.