# Prompt para o Cursor — Encaminhar WhatsApp Smart Guide para Railway

Copie **todo o bloco abaixo** e cole como mensagem no chat do Cursor, no projeto Replit que já recebe o webhook da Meta (app IAE / prefeituras / turismo).

---

## INÍCIO DO PROMPT (copiar daqui)

### Contexto

Este projeto Replit é o **app Meta** que já recebe o webhook do WhatsApp Cloud API para a plataforma de turismo das prefeituras. **Não altere a URL do webhook na Meta** — ela continua apontando para este Replit.

Foi criado um **segundo produto** na mesma WABA: **IAE Smart Guide** (mini-sites para produtores rurais). O backend desse produto roda na **Railway**, repositório separado (`iaesmartguide_manager`).

Precisamos que **mensagens recebidas no número Smart Guide Louveira** sejam **encaminhadas (proxy)** para a API na Railway, que processa o fluxo (FSM), envia respostas via Graph API e persiste mídia no R2.

**Mensagens de outros números da WABA** (prefeituras / turismo) devem continuar funcionando **exatamente como hoje**, sem regressão.

---

### Arquitetura alvo

```
Meta WhatsApp Cloud API
        │
        ▼ (webhook inalterado — continua neste Replit)
   Este projeto (Replit)
        │
        ├── phone_number_id === Smart Guide Louveira
        │         └── POST encaminhado ──► Railway /webhooks/whatsapp
        │                                      └── responde ao usuário via Graph API
        │
        └── outros phone_number_id
                  └── handler atual das prefeituras (sem mudança)
```

---

### Dados fixos (Smart Guide Louveira)

| Campo | Valor |
|-------|--------|
| Número exibido | +55 19 93619-6154 |
| **Phone Number ID** (usar no roteamento) | `960195340517000` |
| WABA | Agente IAE waba |
| WABA ID (referência) | `457003887486329` |
| URL Railway (encaminhar POST) | `https://iaesmartguideapi-production.up.railway.app/webhooks/whatsapp` |

---

### O que implementar neste projeto (Replit)

1. **Analisar** onde está o handler do webhook WhatsApp:
   - Rota GET: verificação Meta (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`) — **não alterar**
   - Rota POST: recebe eventos `messages` — **adicionar roteamento no início**

2. **No início do POST**, antes do fluxo das prefeituras:
   - Extrair `phone_number_id` de:
     `req.body.entry[0].changes[0].value.metadata.phone_number_id`
   - Se `phone_number_id === process.env.SMARTGUIDE_PHONE_ID` (ou `960195340517000`):
     - Fazer `fetch` POST para a URL Railway acima
     - Repassar o **body JSON inteiro** (`req.body`), sem modificar
     - Headers:
       - `Content-Type: application/json`
       - `X-Webhook-Forward-Secret: <valor>` **somente se** `process.env.WHATSAPP_FORWARD_SECRET` existir
     - Responder à Meta com **HTTP 200** imediatamente (`return res.sendStatus(200)`)
     - **Não** processar nem responder ao usuário neste Replit — a Railway envia as respostas
   - Caso contrário: seguir o código existente das prefeituras

3. **Não fazer**:
   - Não mudar URL do webhook na Meta
   - Não mudar `VERIFY_TOKEN` / fluxo GET de verificação
   - Não remover ou refatorar o handler das prefeituras
   - Não commitar tokens no código — usar env vars

4. **Variáveis de ambiente** sugeridas no Replit (Secrets):

```env
SMARTGUIDE_PHONE_ID=960195340517000
SMARTGUIDE_RAILWAY_URL=https://iaesmartguideapi-production.up.railway.app/webhooks/whatsapp
WHATSAPP_FORWARD_SECRET=<mesmo valor configurado na Railway, se houver>
```

`WHATSAPP_FORWARD_SECRET` é opcional no MVP: se não existir na Railway, omitir o header no fetch.

---

### Contrato da API Railway (destino do encaminhamento)

- **Endpoint:** `POST /webhooks/whatsapp`
- **Body:** payload original da Meta (inalterado)
- **Header opcional:** `X-Webhook-Forward-Secret` — Railway valida se `WHATSAPP_FORWARD_SECRET` estiver definido
- **Filtro na Railway:** ignora mensagens cujo `metadata.phone_number_id` ≠ `PHONE_NUMBER_ID` configurado (`960195340517000`)
- **Resposta Railway:** sempre 200 rápido para o Replit; processamento assíncrono interno

A Railway usa `WHATSAPP_TOKEN` + `PHONE_NUMBER_ID` próprios para **enviar** respostas e **baixar** mídia — o Replit **não precisa** enviar token no forward.

---

### Exemplo de referência (Express — adaptar ao stack real do projeto)

```javascript
const SMARTGUIDE_PHONE_ID = process.env.SMARTGUIDE_PHONE_ID ?? "960195340517000";
const RAILWAY_WEBHOOK =
  process.env.SMARTGUIDE_RAILWAY_URL ??
  "https://iaesmartguideapi-production.up.railway.app/webhooks/whatsapp";

// Dentro do POST webhook, ANTES do handler prefeituras:
const phoneNumberId = req.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

if (phoneNumberId === SMARTGUIDE_PHONE_ID) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (process.env.WHATSAPP_FORWARD_SECRET) {
      headers["X-Webhook-Forward-Secret"] = process.env.WHATSAPP_FORWARD_SECRET;
    }
    await fetch(RAILWAY_WEBHOOK, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
    });
  } catch (err) {
    console.error("[SmartGuide → Railway forward failed]", err);
  }
  return res.sendStatus(200);
}

// ... código existente prefeituras ...
```

**Importante:** adaptar ao padrão do projeto (async/await, framework, middleware de body parser JSON, nome da rota, etc.). Não impor Express se o projeto usar Flask, Fastify, etc.

---

### Tarefas para o agente

1. Localizar o arquivo(s) do webhook WhatsApp neste repositório Replit
2. Identificar stack e padrão de rotas existente
3. Implementar encaminhamento mínimo (menor diff possível)
4. Adicionar env vars documentadas (README ou comentário no código)
5. Garantir que GET de verificação Meta continua intacto
6. Listar arquivos alterados e como testar

---

### Como testar após implementar

1. **Prefeituras (regressão):** enviar mensagem no número de turismo — fluxo antigo deve funcionar
2. **Smart Guide:**
   - Na Railway, chamar (com secret admin):
     `GET /api/admin/whatsapp-prepare-test?secret=...&phone=5511XXXXXXXXX`
     (número do celular de teste, só dígitos, com DDD)
   - Do celular, enviar "Oi" para **+55 19 93619-6154**
   - Esperado: resposta automática pedindo **nome comercial**
3. **Logs Replit:** confirmar forward quando `phone_number_id = 960195340517000`
4. **Logs Railway:** confirmar recebimento em `/webhooks/whatsapp` e envio de resposta

---

### Critérios de aceite

- [ ] Webhook Meta continua apontando para este Replit
- [ ] GET verify_token inalterado
- [ ] Número Louveira (`960195340517000`) encaminha para Railway
- [ ] Outros números seguem fluxo prefeituras sem mudança
- [ ] Meta sempre recebe 200 rápido no POST
- [ ] Nenhum token hardcoded no código
- [ ] Diff mínimo, sem refatoração desnecessária

---

### Instrução final

Analise o código deste repositório Replit, implemente o encaminhamento conforme acima e mostre o diff. Se houver ambiguidade (múltiplas rotas webhook, middleware que consome body, etc.), explique a escolha antes de alterar arquivos não relacionados.

## FIM DO PROMPT
