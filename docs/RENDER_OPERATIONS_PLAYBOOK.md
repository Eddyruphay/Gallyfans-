# Gallyfans Render Operations Playbook

Este playbook transforma nosso conhecimento técnico em poder estratégico. Ele não apenas documenta os comandos da API do Render, mas estabelece "jogadas" (Plays) para gerenciar nosso serviço `gallyfans-worker` com agilidade e inteligência.

**Nossos Ativos Estratégicos:**
- **API Key:** `rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc` (Use `$RENDER_API_KEY` em seus scripts)
- **Service ID (`gallyfans-worker`):** `srv-d58eegbe5dus73dsek7g` (Use `$SERVICE_ID` em seus scripts)

---

## Playbook de Operações da API

Esta é a referência tática para interagir diretamente com a API do Render.

### 🎭 Serviços

Comandos para inspecionar e gerenciar o estado do serviço.

#### Obter detalhes do serviço
**Objetivo:** Ter um panorama completo da configuração e estado atual do serviço.

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$SERVICE_ID" | jq .
```

#### Reiniciar um serviço (Nudge)
**Objetivo:** Forçar uma reinicialização rápida do serviço sem passar por todo o processo de build.

```bash
curl -X POST -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$SERVICE_ID/restart"
```
**Quando usar:** Como primeira tentativa se o serviço estiver online mas não respondendo, e os logs não mostrarem um crash.

---

### 🔑 Variáveis de Ambiente

Gerenciamento seguro das configurações do ambiente.

#### Listar todas as variáveis de ambiente
**Objetivo:** Verificar as chaves de todas as variáveis configuradas no serviço. (Valores de segredos não são retornados por segurança).

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$SERVICE_ID/env-vars" | jq .
```

#### Atualizar UMA variável de ambiente (PATCH)
**Objetivo:** Modificar o valor de uma única variável de ambiente de forma segura, sem afetar as outras.
**Esta é a forma recomendada e cirúrgica de atualização.**

```bash
# Exemplo: Atualizando a WA_SESSION_BASE64
curl -X PATCH -s \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d 
  '{
    "key": "WA_SESSION_BASE64",
    "value": "SUA_NOVA_SESSAO_EM_BASE64"
  }' \
  "https://api.render.com/v1/services/$SERVICE_ID/env-vars"
```

#### Substituir TODAS as variáveis de ambiente (PUT)
**Objetivo:** Substituir o conjunto completo de variáveis de ambiente.
**ATENÇÃO: Use com extremo cuidado. Todas as variáveis não incluídas na chamada serão removidas.**

```bash
curl -X PUT -s \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d \
  '[
    {"key": "DATABASE_URL", "value": "valor_mantido_ou_novo"},
    {"key": "TARGET_CHANNEL_ID", "value": "valor_mantido_ou_novo"},
    {"key": "NOVA_VARIAVEL", "value": "novo_valor"}
  ]' \
  https://api.render.com/v1/services/$SERVICE_ID/env-vars
```

---

### 🚀 Deploys

Comandos para gerenciar o ciclo de vida de builds e deploys.

#### Acionar um novo deploy (Hard Reset)
**Objetivo:** Forçar um novo deploy para aplicar código novo (`git push`) ou variáveis de ambiente atualizadas.

```bash
curl -X POST -s \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": "do_not_clear"}' \
  "https://api.render.com/v1/services/$SERVICE_ID/deploys"
```

#### Listar deploys recentes
**Objetivo:** Verificar o histórico de deploys, seus status (`live`, `deactivated`, `build_in_progress`) e os commits associados.

```bash
# Lista os 5 deploys mais recentes
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$SERVICE_ID/deploys?limit=5" | jq .
```

---
Este playbook é um documento vivo. Vamos refiná-lo a cada novo desafio e vitória.