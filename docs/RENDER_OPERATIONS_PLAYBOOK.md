# Gallyfans Render Operations Playbook

Este playbook transforma nosso conhecimento técnico em poder estratégico. Ele não apenas documenta os comandos da API do Render, mas estabelece "jogadas" (Plays) para gerenciar nosso serviço `gallyfans-worker` com agilidade e inteligência.

**Nossos Ativos Estratégicos:**
- **API Key:** `rnd_m62kOVXNewbmE3OzJdw57rZCW0Pc` (Use `$RENDER_API_KEY`)
- **Service ID (`gallyfans-worker`):** `srv-d58eegbe5dus73dsek7g` (Use `$SERVICE_ID`)

---

### Play #1: Diagnóstico Rápido - "O serviço está saudável?"

**Objetivo:** Em menos de 30 segundos, ter um panorama completo da saúde do serviço.

**Estratégia:**
1.  **Verifique os Eventos:** A forma mais rápida de detectar problemas. Procure por eventos de `server_failed`.
    ```bash
    curl -s -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/services/$SERVICE_ID/events?limit=5" | jq .
    ```
2.  **Confirme o Status:** Se não houver falhas, confirme se o último deploy foi bem-sucedido.
    ```bash
    curl -s -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/services/$SERVICE_ID/deploys?limit=1" | jq .
    ```

**Indicador de Sucesso:** O último deploy tem status `live` e não há eventos `server_failed` recentes.

---

### Play #2: A Reconfiguração - "Preciso mudar uma variável de ambiente."

**Objetivo:** Adicionar ou modificar uma variável de ambiente, como a `REDIS_URL` ou `PAIRING_PHONE_NUMBER`.

**Estratégia:**
1.  **Liste as Variáveis Atuais:** **SEMPRE** comece listando as variáveis existentes para não perder nenhuma.
    ```bash
    curl -s -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services/$SERVICE_ID/env-vars | jq .
    ```
2.  **Execute a Atualização:** Envie a lista **completa** de variáveis, incluindo a sua alteração. O comando abaixo é o nosso estado atual e correto. Adapte-o conforme necessário.
    ```bash
    # ATENÇÃO: Este comando SOBRESCREVE TODAS as variáveis.
    curl -X PUT -s \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H "Content-Type: application/json" \
      -d \
      '[
        {"key": "REDIS_URL", "value": "rediss://red-d58qcpbuibrs73at9pmg:ne4AhJwNAIPTU1gxFf9cL6HimCBLfvcy@oregon-keyvalue.render.com:6379"},
        {"key": "DATABASE_URL", "value": "postgresql://neondb_owner:npg_xcGuB8drCv5e@ep-still-glitter-adwdgr1z.c-2.us-east-1.aws.neon.tech/gallyfans_db?sslmode=require&channel_binding=require"},
        {"key": "TARGET_CHANNEL_ID", "value": "120363404510855649@g.us"},
        {"key": "PAIRING_PHONE_NUMBER", "value": "258835097404"}
      ]' \
      https://api.render.com/v1/services/$SERVICE_ID/env-vars
    ```

---

### Play #3: O "Hard Reset" - "Vamos aplicar as mudanças."

**Objetivo:** Forçar um novo deploy para aplicar código novo ou variáveis de ambiente atualizadas.

**Estratégia:**
Execute um POST vazio para o endpoint de deploys. Isso aciona o fluxo de build e deploy usando o commit mais recente do branch `main`.

```bash
curl -X POST -s \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://api.render.com/v1/services/$SERVICE_ID/deploys
```

**Quando usar:** Sempre após um `git push` para o `main` ou após executar o **Play #2**.

---

### Play #4: O "Nudge" - "O serviço parece travado."

**Objetivo:** Forçar uma reinicialização rápida do serviço sem passar por todo o processo de build.

**Estratégia:**
Use o endpoint de `restart`. É mais rápido que um deploy completo.

```bash
curl -X POST -s -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services/$SERVICE_ID/restart
```

**Quando usar:** Como primeira tentativa se o serviço estiver online mas não respondendo como esperado, e os logs não mostrarem um crash.

---

### Play #5: Análise de Causa Raiz - "Por que o serviço está caindo?"

**Objetivo:** Diagnosticar e resolver um loop de crash, como o que resolvemos hoje.

**Metodologia:**
1.  **Execute o Play #1 (Diagnóstico Rápido).** A presença de múltiplos eventos `server_failed` confirma o loop de crash.
2.  **Execute o Play #2 (Reconfiguração), mas apenas para visualizar.** Verifique se todas as variáveis de ambiente necessárias estão presentes e corretas (`REDIS_URL`, `DATABASE_URL`, `PAIRING_PHONE_NUMBER`, etc.).
3.  **Se a configuração estiver correta, o problema é o código.** Analise o `src/index.ts` e os módulos que ele chama (como `whatsapp/client.ts`) para entender o fluxo de inicialização. A falha provavelmente está lá.
4.  **Corrija o código,** faça o `git push`, e então execute o **Play #3 (Hard Reset)** para implantar a correção.

Este playbook é um documento vivo. Vamos refiná-lo a cada novo desafio e vitória.
