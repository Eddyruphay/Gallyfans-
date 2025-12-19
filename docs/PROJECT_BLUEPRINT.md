# Blueprint do Ecossistema Gally v1.0

**Status do Documento:** Ativo (Dezembro de 2025)

## 1. Visão e Filosofia do Ecossistema

**Gally™** é uma sociedade de conteúdo digital focada em criar e distribuir valor para nichos de audiência específicos através de canais diretos e engajadores. Nossa filosofia é baseada em **automação, eficiência e alto valor agregado**, onde uma única assinatura destrava um universo de conteúdo curado.

A inovação é o nosso motor. Buscamos não apenas otimizar o conhecido, mas explorar o desconhecido, antecipando tendências e criando novos horizontes de interação e conteúdo.

---

## 2. Arquitetura do Ecossistema

O ecossistema é composto por componentes modulares e interdependentes, cada um com uma função clara.

### 2.1. O Pilar de Monetização: GallyPay

- **Missão:** Ser o portal de entrada para o ecossistema Gally. Um sistema de assinatura centralizado, simples e seguro.
- **Modelo de Negócio:** Uma taxa de assinatura mensal (atualmente definida em 22 MT) que concede ao usuário acesso a todos os canais de conteúdo da Gally.
- **Arquitetura Proposta (A ser pesquisada):**
    - **Frontend:** Uma página de checkout simples e segura, possivelmente hospedada na Vercel ou Cloudflare Pages.
    - **Backend:** Uma API (ex: Hono.js na Vercel/Cloudflare) que se integra com um gateway de pagamento.
    - **Gateway de Pagamento:** Pesquisar e integrar soluções como **Stripe**, **PayPal**, ou gateways locais (ex: M-Pesa), dependendo do mercado-alvo.
    - **Webhooks:** O GallyPay deve emitir eventos (ex: `subscription.created`, `subscription.canceled`) via webhooks. Esses eventos serão consumidos por outros sistemas para gerenciar o acesso dos usuários.

### 2.2. O Motor de Conteúdo: 4Reels

- **Missão:** Atuar como a agência de curadoria e produção de conteúdo para os canais da Gally. É o componente que alimenta o ecossistema com material relevante e de alta qualidade.
- **Arquitetura Atual:** A arquitetura é centrada no `gallyfans-worker`, um serviço de background robusto e resiliente. Ela é composta por:
    - **Núcleo Operacional (Termux & Gemini):** Para desenvolvimento, administração e execução dos scripts de curadoria.
    - **Publicador (`gallyfans-worker`):** Um serviço Node.js, conteinerizado com Docker, que roda de forma contínua (na Render). Ele é responsável por buscar trabalhos na fila e publicá-los no WhatsApp.
    - **API & Banco de Dados (Vercel & Neon):** A espinha dorsal de dados, fornecendo a fila de publicação e o conteúdo para o worker.
    - **Cache de Sessão (Redis):** Garante a persistência da sessão do WhatsApp, permitindo que o worker se reconecte automaticamente.

### 2.3. Os Canais de Distribuição

Canais de WhatsApp onde o conteúdo curado pelo 4Reels é entregue.

- **Gallyfans (Ativo):**
    - **Foco:** Conteúdo de modelos e ensaios fotográficos.
    - **Status:** Em operação, com automação de publicação em andamento.

- **GallySound (Conceito):**
    - **Foco:** Curadoria de música, playlists, sets de DJs, e notícias do mundo da música.
    - **Implicações:** Exigirá novos scripts de curadoria (`curator-sound.mts`) para extrair informações de plataformas como SoundCloud, Spotify, ou blogs de música.

- **GallyNews (Conceito):**
    - **Foco:** Curadoria de notícias sobre tecnologia, cultura, ou qualquer outro nicho de interesse.
    - **Implicações:** Exigirá scripts de curadoria (`curator-news.mts`) focados em portais de notícias, feeds RSS e APIs de mídia.

---

## 3. Fluxo de Integração do Ecossistema (Visão Futura)

Este é o fluxo que conecta todos os componentes:

1.  **Aquisição:** Um novo usuário acessa a página do GallyPay e realiza a assinatura.
2.  **Ativação:** O gateway de pagamento confirma o pagamento e notifica o backend do GallyPay.
3.  **Notificação:** O GallyPay dispara um webhook (`subscription.created`) com os dados do usuário (ex: número de WhatsApp).
4.  **Provisionamento:** Um serviço "Gerenciador de Acessos" (pode ser um novo Cloudflare Worker ou uma função na nossa API Vercel) recebe o webhook.
5.  **Ação:** O Gerenciador de Acessos utiliza a API do WhatsApp (via Baileys) para adicionar o número do usuário aos grupos/canais correspondentes (Gallyfans, GallySound, etc.).
6.  **Entrega de Conteúdo:** O `gallyfans-worker` continua seu trabalho, e o novo usuário começa a receber o conteúdo nos canais em que foi adicionado.

---

## 4. Roadmap Estratégico

Dividimos o desenvolvimento do ecossistema em fases claras.

- **FASE 1: Solidificar o Core (Em Andamento)**
    - **Objetivo:** Finalizar e estabilizar 100% da automação do canal `Gallyfans`.
    - **Entregáveis:** Scripts de curadoria robustos e um `gallyfans-worker` totalmente autônomo e estável, publicando conteúdo de forma confiável.

- **FASE 2: Construir o Pilar de Monetização**
    - **Objetivo:** Desenvolver e lançar a primeira versão do `GallyPay`.
    - **Entregáveis:** Pesquisa de gateway de pagamento, desenvolvimento da página de checkout e da API de backend, e implementação do sistema de webhooks.

- **FASE 3: Expandir o Conteúdo**
    - **Objetivo:** Lançar os novos canais de conteúdo.
    - **Entregáveis:** Desenvolvimento dos scripts de curadoria para `GallySound` e `GallyNews` e integração com o fluxo de publicação existente.

- **FASE 4: Gerenciamento e Retenção**
    - **Objetivo:** Construir o sistema de gerenciamento de acessos e cancelamentos.
    - **Entregáveis:** O serviço "Gerenciador de Acessos" que lida com os webhooks do GallyPay para adicionar/remover usuários dos canais.

---

## 5. Detalhes Técnicos Atuais

*(Esta seção foi simplificada após a reestruturação do projeto em Dezembro de 2025. O foco agora é na arquitetura principal do `gallyfans-worker` e sua interação com a API e o banco de dados.)*

A arquitetura atual é um modelo distribuído que utiliza:
- **`gallyfans-worker`:** Um serviço de background em Node.js para publicação automática.
- **Conteinerização:** Docker para criar um ambiente de produção consistente e seguro para o worker.
- **Banco de Dados Serverless:** Neon (PostgreSQL) para armazenar todo o conteúdo e a fila de publicação.
- **API Serverless:** Vercel para expor os dados do banco de dados de forma segura para o worker.
- **Cache Distribuído:** Redis para persistir a sessão do WhatsApp.
