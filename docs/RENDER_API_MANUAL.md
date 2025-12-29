# Render API Manual (Gallyfans)

Este manual fornece uma referência prática para interagir com a API da Render para gerenciar os serviços do projeto Gallyfans.

**Valores Atuais (Atualizado em 29/12/2025):**
- **API Key:** `rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc` (Substitua por `$RENDER_API_KEY` em scripts)
- **Service ID (`gallyfans-worker`):** `srv-d58eegbe5dus73dsek7g` (Substitua por `$SERVICE_ID` em scripts)

---

### 1. Listar Serviços

Use este comando para obter uma lista de todos os serviços associados à sua conta, incluindo seus IDs.

**Comando:**
```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services | jq .
```

**Exemplo Real:**
```bash
curl -s -H "Authorization: Bearer rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc" https://api.render.com/v1/services | jq .
```

---


### 2. Obter Variáveis de Ambiente

Use este comando para listar todas as variáveis de ambiente de um serviço específico.

**Comando:**
```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services/$SERVICE_ID/env-vars | jq .
```

**Exemplo Real:**
```bash
curl -s -H "Authorization: Bearer rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc" https://api.render.com/v1/services/srv-d58eegbe5dus73dsek7g/env-vars | jq .
```

---


### 3. Atualizar Variáveis de Ambiente

Use este comando para substituir **todas** as variáveis de ambiente de um serviço. O corpo do `curl` deve ser um array JSON com todas as variáveis que você deseja definir.

**Atenção:** Este comando sobrescreve o conjunto de variáveis existente. Se você quer apenas adicionar ou modificar uma, precisa enviar o conjunto completo de variáveis desejadas.

**Comando:**
```bash
curl -X PUT -s \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d \
  '[
    {"key": "KEY_1", "value": "VALUE_1"},
    {"key": "KEY_2", "value": "VALUE_2"}
  ]' \
  https://api.render.com/v1/services/$SERVICE_ID/env-vars
```

**Exemplo Real (configurando `gallyfans-worker`):**
```bash
curl -X PUT -s \
  -H "Authorization: Bearer rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc" \
  -H "Content-Type: application/json" \
  -d \
  '[
    {"key": "REDIS_URL", "value": "rediss://red-d4kc50buibrs73fdgp2g:tYg9xVhCMR6uaRA1dSbW4JUODgOYQb7s@oregon-keyvalue.render.com:6379"},
    {"key": "DATABASE_URL", "value": "postgresql://neondb_owner:npg_xcGuB8drCv5e@ep-still-glitter-adwdgr1z.c-2.us-east-1.aws.neon.tech/gallyfans_db?sslmode=require&channel_binding=require"},
    {"key": "TARGET_CHANNEL_ID", "value": "120363404510855649@g.us"}
  ]' \
  https://api.render.com/v1/services/srv-d58eegbe5dus73dsek7g/env-vars
```

---


### 4. Iniciar um Novo Deploy

Use este comando para forçar um novo deploy de um serviço, usando o commit mais recente do branch configurado.

**Comando:**
```bash
curl -X POST -s \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://api.render.com/v1/services/$SERVICE_ID/deploys
```

**Exemplo Real:**
```bash
curl -X POST -s \
  -H "Authorization: Bearer rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://api.render.com/v1/services/srv-d58eegbe5dus73dsek7g/deploys
```

---


### 5. Verificar o Status de um Deploy

Use este comando para obter o status de um deploy específico.

**Comando:**
```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services/$SERVICE_ID/deploys/$DEPLOY_ID | jq .
```

**Exemplo Real:**
```bash
# Substitua $DEPLOY_ID pelo ID real, ex: dep-d593530gjchc73af5j8g
curl -s -H "Authorization: Bearer rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc" https://api.render.com/v1/services/srv-d58eegbe5dus73dsek7g/deploys/dep-d593530gjchc73af5j8g | jq .
```

---


### 6. Reiniciar o Serviço

Força uma reinicialização do serviço, sem fazer um novo deploy.

**Comando:**
```bash
curl -X POST -s -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services/$SERVICE_ID/restart
```

**Exemplo Real:**
```bash
curl -X POST -s -H "Authorization: Bearer rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc" https://api.render.com/v1/services/srv-d58eegbe5dus73dsek7g/restart
```

---


### 7. Listar Eventos do Serviço

Mostra os eventos mais recentes do serviço, como deploys, reinicializações e falhas.

**Comando:**
```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/services/$SERVICE_ID/events?limit=10" | jq .
```

**Exemplo Real:**
```bash
curl -s -H "Authorization: Bearer rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc" "https://api.render.com/v1/services/srv-d58eegbe5dus73dsek7g/events?limit=10" | jq .
```