# Runbook de Comandos da API do Render

Este documento contém uma lista de comandos `curl` prontos para usar para gerenciar os serviços no Render.

**Pré-requisitos:**
1.  `jq` deve estar instalado (`pkg install jq`).
2.  A sua chave de API do Render deve estar disponível. Recomenda-se configurar como uma variável de ambiente para facilitar:
    `export RENDER_API_KEY="SUA_CHAVE_AQUI"`

**ID do Serviço `gallyfans`:** `srv-d5204u63jp1c73f66e20`

---

### 1. Listar Variáveis de Ambiente

Mostra todas as variáveis de ambiente para o serviço `gallyfans`.

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" \
  https://api.render.com/v1/services/srv-d5204u63jp1c73f66e20/env-vars | jq .
```

---

### 2. Listar Eventos do Serviço

Mostra os 10 eventos mais recentes do serviço, como deploys, reinicializações e falhas.

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" \
  "https://api.render.com/v1/services/srv-d5204u63jp1c73f66e20/events?limit=10" | jq .
```

---

### 3. Obter Logs do Serviço

Mostra as últimas 100 linhas de log do serviço `gallyfans`.

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" \
  "https://api.render.com/v1/services/srv-d5204u63jp1c73f66e20/logs?limit=100" | jq .
```

---

### 4. Reiniciar o Serviço

Força uma reinicialização do serviço `gallyfans`, sem fazer um novo deploy.

```bash
curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" \
  https://api.render.com/v1/services/srv-d5204u63jp1c73f66e20/restart
```

---

### 5. Disparar um Novo Deploy

Inicia um novo deploy para o serviço `gallyfans` a partir do commit mais recente do branch configurado.

```bash
curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" -H "Content-Type: application/json" \
  -d '{"clearCache": "do_not_clear"}' \
  https://api.render.com/v1/services/srv-d5204u63jp1c73f66e20/deploys
```
