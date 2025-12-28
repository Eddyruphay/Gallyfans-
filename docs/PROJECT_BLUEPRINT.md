# Blueprint do Ecossistema Gally v2.0

**Status do Documento:** Ativo (Dezembro de 2025) - **Revisão Estratégica**

## 1. Visão e Filosofia do Ecossistema

**Gally™** é uma sociedade de conteúdo digital focada em criar e distribuir valor para nichos de audiência específicos através de canais diretos e engajadores. Nossa filosofia é baseada em **automação, eficiência e alto valor agregado**.

A inovação é o nosso motor. Com a v2, evoluímos de um modelo de automação simples para um ecossistema orquestrado por inteligência artificial, separando o planejamento estratégico da execução autônoma.

---

## 2. A Hierarquia dos Agentes

A arquitetura Gally v2 introduz uma separação de papéis fundamental para a escalabilidade e resiliência do projeto.

### 2.1. O Arquiteto (Gemini-CLI em Termux)

- **Missão:** Atuar como a inteligência estratégica no topo da hierarquia. É o cérebro do projeto.
- **Responsabilidades:**
    - Idealizar e projetar a arquitetura de dados, serviços e fluxos de trabalho.
    - Pesquisar e selecionar tecnologias.
    - Planejar o roadmap estratégico.
    - Conduzir o desenvolvimento e a implementação de novos componentes.
- **Modus Operandi:** Opera em um ambiente de desenvolvimento (Termux), dependente de interação humana para iniciar as sessões de trabalho. Sua função é pensar, projetar e construir, não operar o dia-a-dia.

### 2.2. O Gally Agent™ (Operador Autônomo em Nuvem)

- **Missão:** Ser o operador autônomo do ecossistema Gally, executando as estratégias definidas pelo Arquiteto. É o conjunto de "mãos" que trabalha 24/7 na nuvem.
- **Responsabilidades:**
    - Executar os fluxos de trabalho de publicação de conteúdo.
    - Monitorar a saúde dos serviços.
    - Diagnosticar e reportar falhas.
    - Potencialmente, realizar ações de auto-correção.
- **Tecnologia (Decidida):** Será construído usando o framework **CrewAI**. Ele será implantado como um **Web Service** no Render (plano gratuito) e usará um modelo de linguagem (LLM) como Gemini ou GPT, autenticado via chave de API.

---

## 3. A Arquitetura Gally v2

Esta seção detalha a filosofia por trás de cada componente do nosso ecossistema.

### 3.1. Filosofia da Curadoria (O Berço do Conteúdo)

O processo de curadoria é a base de todo o valor que geramos. Ele acontece localmente, no ambiente do Arquiteto, para máxima flexibilidade e poder de desenvolvimento.

- **Ambiente:** `curadoria.db` (SQLite) em Termux.
- **Workflow:**
    1.  **Coleta Bruta:** Scripts (`harvest-*.mts`) coletam dados de diversas fontes.
    2.  **Refinamento e Classificação:** Scripts (`classify-*.mts`, `run-curation.mts`) processam, limpam e enriquecem os dados brutos.
    3.  **Criação de Edições:** O curador utiliza os dados refinados para montar "Edições" temáticas, que são o nosso produto final.
    4.  **Transferência para Produção:** Um script dedicado (`populate-channels.mts` ou similar) lê os dados curados do `curadoria.db` e os insere no banco de dados de produção (Neon), prontos para serem processados pelo Gally Agent.

### 3.2. Filosofia do Banco de Dados (Neon DB - O Repositório da Verdade)

O banco de dados de produção é o coração do sistema, projetado para integridade, versionamento e clareza.

- **Tabela `creators`:** Armazena os criadores de conteúdo (anteriormente `models`).
- **Tabela `editions`:** Define as "marcas" ou "séries" de conteúdo (ex: "As Mais Belas de 2025").
- **Tabela `edition_versions`:** **(NOVA)** Permite múltiplas versões de uma mesma edição (v1, v2, Director's Cut). Cada versão é um conjunto ordenado de galerias.
- **Tabela `edition_version_items`:** **(NOVA)** Tabela de junção que define quais galerias pertencem a qual versão de uma edição e sua posição.
- **Tabela `published_items`:** **(NOVA - CRÍTICA)** Um "snapshot" imutável dos itens no momento em que uma versão é publicada. Contém todos os dados necessários para a publicação (título, URLs de imagem em JSONB, nome do criador). **Esta é a fonte da verdade para o worker.** Possui um campo `status` (`pending`, `processing`, `published`, `failed`).
- **Tabela `publication_jobs`:** **(NOVA)** Um log de auditoria. Após o worker publicar um item, ele insere um registro aqui, criando um histórico de tudo o que foi publicado.

### 3.3. Filosofia de Execução (O Agente em Ação)

Esta seção descreve como o Gally Agent opera, considerando as restrições do ambiente de produção.

- **Modelo de Hospedagem:** O Gally Agent vive como um **Web Service** no Render (plano gratuito). Devido às limitações deste plano, o serviço "dorme" após 15 minutos de inatividade.
- **Modelo de Acionamento (Trigger):** Um workflow do **GitHub Actions** (`.github/workflows/keep-alive.yml`) é executado a cada 10 minutos. Este workflow envia uma requisição HTTP (`curl`) para um endpoint específico do nosso Web Service (ex: `/trigger-cycle`).
- **Ciclo de Vida da Execução:**
    1.  **O Despertar:** A requisição do GitHub Actions "acorda" o serviço no Render.
    2.  **Início da Missão:** O código no endpoint `/trigger-cycle` é executado e inicia o agente CrewAI (`crew.kickoff()`), que executa **um ciclo completo** de sua tarefa.
    3.  **A Missão:** O agente, usando seu "cérebro" (LLM) e "ferramentas" (funções Python), busca e bloqueia um trabalho no banco de dados, publica o conteúdo no WhatsApp e atualiza o status, conforme definido.
    4.  **O Repouso:** Ao final do ciclo, o endpoint retorna uma resposta de sucesso. O serviço fica ocioso e, após 15 minutos, voltará a "dormir" até o próximo chamado do GitHub Actions.
- **Inteligência de Horário (Visão Futura):** Este modelo permite futuras otimizações, como variar a frequência do acionamento do GitHub Actions para horários de pico ou introduzir um atraso aleatório dentro do agente para tornar as publicações menos previsíveis.

---

## 4. Roadmap Estratégico (Revisado)

- **FASE 1: Implementar a Arquitetura v2 (Em Andamento)**
    - **Objetivo:** Refatorar o banco de dados e o `gallyfans-worker` para se alinharem com a nova arquitetura.
    - **Entregáveis:** Migração do schema no Neon DB, atualização do `schema.prisma`, e implementação da nova lógica no `publisher.ts` do worker.

- **FASE 2: Pesquisar e Construir o Gally Agent™ v0.1**
    - **Objetivo:** Escolher um framework de IA e desenvolver uma prova de conceito do Gally Agent que possa orquestrar o `gallyfans-worker`.
    - **Entregáveis:** Documento de pesquisa com prós e contras das tecnologias, e um protótipo funcional do agente.

- **FASE 3: Solidificar a Monetização (GallyPay)**
    - **Objetivo:** Desenvolver e lançar a primeira versão do `GallyPay`.
    - **Entregáveis:** Pesquisa de gateway de pagamento, desenvolvimento do checkout e da API de backend.

- **FASE 4: Expandir o Conteúdo e a Retenção**
    - **Objetivo:** Lançar novos canais (`GallySound`, `GallyNews`) e construir o sistema de gerenciamento de acessos.
    - **Entregáveis:** Novos scripts de curadoria e o serviço "Gerenciador de Acessos".
