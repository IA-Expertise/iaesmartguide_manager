# Motor reutilizável — Playbook IAE Smart Guide

Documento vivo para **reaproveitar este motor** em outros projetos (outros nichos, outros domínios, outras marcas).  
Atualizado com os acertos e armadilhas encontrados no piloto **IAE Smart Guide** (turismo rural).

---

## 1. O que é o “motor”

Conjunto de padrões e módulos que se repetem em qualquer produto do tipo **“mini-site + gestão por WhatsApp + IA opcional”**:

| Camada | Responsabilidade | Stack deste projeto |
|--------|------------------|---------------------|
| **API + FSM** | Webhook WhatsApp, máquina de estados, CRUD tenant | Express + Prisma (`apps/api`) |
| **DB** | Tenants, fotos, produtos, estado do chat | PostgreSQL + Prisma (`packages/db`) |
| **Web vitrine** | Subdomínio por slug, mobile-first | Next.js middleware (`apps/web`) |
| **Mídia** | Imagens persistentes (Meta expira URL) | Cloudflare R2 |
| **IA** | Textos de marketing sob demanda | Gemini via REST (`lia-marketing.ts`) |
| **Deploy** | API + DB | Railway |
| **Deploy** | Site | Vercel (`apps/web`) |
| **Webhook Meta** | Verificação + encaminhamento | Replit proxy (opcional) |

---

## 2. Arquitetura (copiar mentalmente)

```
Produtor → WhatsApp (Lia)
              ↓
         Webhook (Replit ou direto)
              ↓
         API Railway (FSM + serviços)
              ↓
         PostgreSQL ← fonte única
              ↓
         Next.js (slug.dominio.com.br)
```

**Regra de ouro:** um número WhatsApp = um tenant. Todo fluxo passa pelo `chat_states.current_state`.

---

## 3. Estrutura do monorepo (template)

```
projeto/
├── apps/
│   ├── api/          # Express, webhooks, FSM, admin
│   └── web/          # Next.js vitrine + middleware subdomínio
├── packages/
│   └── db/           # Prisma schema + client
├── docs/             # Playbooks e prompts
├── docker-compose.yml
├── railway.toml
├── .env.example
└── package.json      # workspaces npm
```

**Scripts úteis na raiz:** `build:api`, `build:web`, `dev:api`, `dev:web`, `db:push`, `db:seed`.

---

## 4. Checklist ao clonar para um novo projeto

### 4.1 Git / repositório

Escolher uma estratégia (ver seção 7 deste doc):

- [ ] Novo repo vazio + cópia dos módulos reutilizáveis
- [ ] Template GitHub a partir deste repo
- [ ] Fork + rename (se quiser histórico)

### 4.2 Rebrand (obrigatório)

- [ ] Nome do produto / persona do bot (ex.: Lia → outro nome)
- [ ] `NEXT_PUBLIC_ROOT_DOMAIN` e DNS wildcard `*.dominio`
- [ ] Textos em `handler.ts`, `editing.ts`, `lia-marketing.ts` (tom de voz)
- [ ] Logo/créditos no layout web (`apps/web`)
- [ ] `SEED_SECRET`, `JWT_SECRET`, `REVALIDATE_SECRET` novos
- [ ] Conta Meta WhatsApp / número / `PHONE_NUMBER_ID`

### 4.3 Infra

- [ ] Railway: Postgres + API (variável `PORT`, não fixar porta)
- [ ] Vercel: root `apps/web`, build monorepo
- [ ] R2: bucket + `R2_PUBLIC_URL`
- [ ] `GEMINI_API_KEY` (se usar marketing IA)
- [ ] Webhook: direto na Railway (§8) ou proxy Replit (`docs/prompt-replit-webhook-forward.md`)

### 4.4 Schema Prisma

Adaptar `Tenant` ao nicho, mantendo o padrão:

- `slug`, `whatsappNumber` (unique), `businessName`
- `logoUrl`, fotos (`TenantPhoto`), ofertas (`TenantProduct`)
- `chat_states` com `current_state` + `temp_data` JSON

Rodar: `GET /api/admin/setup?secret=SEED_SECRET` ou `prisma db push` no deploy.

---

## 5. Padrões de código que funcionaram

### 5.1 FSM WhatsApp

- **Estados explícitos** em `states.ts` — nunca string solta.
- **`tempData`** para dados entre passos (slug, fotos pendentes, marketing).
- **Fila por número** (`whatsapp-queue.ts`) — evita race quando usuário manda várias fotos seguidas.
- **Dedup de webhook** (`whatsapp-dedup.ts`) — Meta/Replit podem repetir POST.
- **Responder 200 imediato** no webhook; processar async na fila.
- **Separar erro de handler vs erro de entrega** — não mandar “algo deu errado” em loop.

### 5.2 Menus interativos WhatsApp

- **Máximo 10 linhas por lista** (total, todas as seções). Exceder = API rejeita silenciosamente ou loop de erro.
- Truncar com segurança em `sendWhatsAppList` + log de aviso.
- Submenu quando passar de 10 itens (ex.: “Ver mais imagens”).
- Botões: máx. 3. Títulos: 24 chars. Descrições: 72 chars.

### 5.3 Mídia

- Logo: processar com **Sharp** (`logo-image.ts`); PNG transparente via **documento** no WhatsApp.
- URLs Meta expiram → **persistir no R2** antes de salvar no banco.
- Prefixo `pending://` para mídia recebida antes do slug existir; resolver no publish.

### 5.4 Web vitrine

- **Middleware** reescreve subdomínio → `/sites/[slug]`.
- **Revalidate** após edição (`revalidateTenant` + `REVALIDATE_SECRET`).
- Mobile-first: header fixo, ações sticky, endereço no rodapé (ver PDF de layout).

### 5.5 Marketing com IA (Lia)

- **Gemini via REST** (`fetch` + `AbortSignal`), não depender só do SDK antigo.
- Modelos ativos: `gemini-2.5-flash`, fallback `gemini-3.1-flash-lite`.
- **Fluxo em etapas:** ferramenta → (foto) → assunto → gerar.
- **Prompt:** proibir “Aqui está…”, entregar só texto final; tokens por tipo.
- **Post com foto:** `image` + `caption` na API WhatsApp; caption máx. 1024 chars.
- **3 ferramentas** bastam: Post com foto | Texto compartilhar | Gancho do site.

### 5.6 Admin / debug

Endpoints com `?secret=SEED_SECRET`:

- `/api/admin/whatsapp-check`
- `/api/admin/gemini-test`
- `/api/admin/whatsapp-status`
- `/api/admin/whatsapp-reset?phone=...`

---

## 6. Armadilhas conhecidas (não repetir)

| Problema | Causa | Solução aplicada |
|----------|--------|------------------|
| Menu em loop de erro | Lista com >10 itens | Reduzir itens; submenu Divulgar |
| `open_divulgar` não abria marketing | `isMarketingAction` só `lia_*` | Incluir `open_divulgar` |
| Texto IA cortado | `maxOutputTokens` baixo + prefácio do modelo | Mais tokens; limpar prefácio; mensagens separadas |
| Modelos Gemini mortos | 2.0/1.5 desligados | REST + modelos 2.5/3.x |
| Sem resposta após “Gerando…” | SDK travando / timeout | REST, timeout 55s, fallback de erro |
| Só 1 foto no seletor | Faltava ofertas + paginação | Galeria + fotos de produto + “Ver mais” |
| Railway health fail | API não lia `PORT` | Usar `process.env.PORT` |

---

## 7. Como reaproveitar o Git deste app

**Sim, é possível.** Formas práticas:

### Opção A — Template GitHub (recomendado para vários projetos)

1. No GitHub: **Settings → Template repository** neste repo.
2. Novo projeto: **Use this template** → repo limpo com histórico inicial copiado.
3. Rebrand + deploy novo.

### Opção B — Clone sem histórico (projeto “zerado”)

```bash
git clone https://github.com/IA-Expertise/iaesmartguide_manager.git novo-projeto
cd novo-projeto
rm -rf .git
git init
git add .
git commit -m "chore: bootstrap from iaesmartguide motor"
git remote add origin <url-do-novo-repo>
git push -u origin main
```

### Opção C — Fork

- Mantém link com o original; bom para contribuir de volta, menos bom para produtos comerciais separados.

### Opção D — Extrair só o “motor” (evolução futura)

Mover para pacotes compartilhados:

```
packages/
├── whatsapp-fsm/     # handler, queue, dedup, send
├── marketing-ai/     # gemini + lia prompts
├── tenant-media/     # r2 + sharp
└── db/               # schema base parametrizável
```

Publicar como workspace interno ou npm privado. **Ainda não feito** — este doc registra a intenção.

### O que NÃO copiar cegamente

- `.env` / secrets
- `slug` e dados de seed (`adegatoninho`)
- `PHONE_NUMBER_ID`, tokens Meta
- Domínio `iaesmartguide.com.br` hardcoded — usar `config.rootDomain`

---

## 8. Estratégia Meta — WABA e app por projeto

Hoje o **IAE Smart Guide** compartilha a WABA *Agente IAE* com prefeituras/turismo. O Replit recebe o webhook da Meta e **roteia por `phone_number_id`** para a Railway (ver `docs/prompt-replit-webhook-forward.md`).

Para **novos projetos derivados do motor**, a recomendação é **WABA + app Meta dedicados** por linha de produto.

### 8.1 Três cenários

| Cenário | Descrição | Quando usar |
|---------|-----------|-------------|
| **A — Mesma WABA, vários números** | Um webhook central (ex.: Replit) roteia por `phone_number_id` | Variações do *mesmo* produto; setup rápido |
| **B — WABA + app novos** | Conta WhatsApp e app Meta exclusivos por produto | **Recomendado** para novos nichos/marcas |
| **C — App novo, WABA compartilhada** | Raro na Cloud API; Meta costuma amarrar 1 app ↔ 1 WABA | Evitar como padrão |

### 8.2 Por que WABA dedicada nos projetos novos

| Vantagem | Detalhe |
|----------|---------|
| **Isolamento** | Limite, bloqueio ou problema de qualidade não afeta prefeituras nem outros produtos |
| **Webhook simples** | POST direto na Railway — sem proxy Replit |
| **Marca clara** | Número e nome da assistente pertencem ao produto (não “IAE genérico”) |
| **Venda / spin-off** | Produto pode mudar de dono com pacote Meta próprio |
| **Alinha com o template** | 1 repo template → 1 deploy Railway → 1 par WABA/app |

### 8.3 O que manter separado

| Produto | WABA / app | Webhook |
|---------|------------|---------|
| Prefeituras / turismo (Replit atual) | WABA IAE existente | Replit (sem mudar) |
| IAE Smart Guide (piloto) | Pode ficar na WABA atual ou migrar depois | Replit → Railway |
| **Novo projeto do motor** | **WABA + app novos** | **Direto na Railway** |

### 8.4 Arquitetura alvo (projeto novo)

```
Meta App "Produto X"
    └── WABA "Produto X"
            └── Número da assistente (+55 …)
                    └── Webhook GET/POST → https://api-produto-x.railway.app/webhooks/whatsapp
                            └── FSM + Graph API (respostas)
```

O **código** é o mesmo (template do repo). Mudam: secrets, domínio, persona do bot, `PHONE_NUMBER_ID`, token permanente.

### 8.5 Checklist Meta por projeto novo

1. **Meta Business Manager** (pode ser o mesmo portfólio empresarial IAE)
2. Criar **app Meta** (tipo Business) → adicionar produto **WhatsApp**
3. Criar ou vincular **WABA** dedicada
4. Adicionar **número** (novo ou migrar existente)
5. Gerar **token permanente** do System User (com permissões `whatsapp_business_messaging`, etc.)
6. Configurar **webhook**:
   - URL: `https://<api>/webhooks/whatsapp`
   - Verify token: valor de `VERIFY_TOKEN` na Railway
   - Campos: `messages` (mínimo)
7. Anotar na Railway:
   - `WHATSAPP_TOKEN`
   - `PHONE_NUMBER_ID`
   - `WABA_ID` (referência; opcional no código)
   - `VERIFY_TOKEN`
8. **Não** definir `WHATSAPP_FORWARD_SECRET` se webhook for direto (proxy Replit desligado)
9. Testar: `GET /api/admin/whatsapp-check?secret=SEED_SECRET`
10. Template de mensagens / opt-in — necessário só se for **mensagem proativa** (lembretes, campanhas)

### 8.6 Um deploy ou multi-tenant na API?

| Modelo | Descrição | Quando |
|--------|-----------|--------|
| **1 Railway por produto** | Um `.env` por WABA/número | Piloto, white-label, até ~5 produtos |
| **1 API, N WABAs** | Vários `PHONE_NUMBER_ID` + roteamento no webhook | Muitos clientes, mesmo código e DB |

Para os primeiros derivados do motor, **1 deploy por produto** simplifica operação e debug.

### 8.7 Custo e operação (referência)

- Número WhatsApp Cloud API: cobrança Meta por conversa + número (ver preço atual na Meta)
- Cada WABA nova: processo de verificação business (pode reutilizar BM já aprovado)
- Token expira se System User/permissões mudarem — documentar no runbook do projeto

---

## 9. Variáveis de ambiente (referência)

Ver `.env.example`. Mínimo produção:

- `DATABASE_URL`
- `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `VERIFY_TOKEN`
- `WHATSAPP_FORWARD_SECRET` (se Replit)
- `R2_*` + `R2_PUBLIC_URL`
- `REVALIDATE_SECRET`, `API_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`
- `GEMINI_API_KEY` (marketing)
- `SEED_SECRET` (admin/setup)

---

## 10. Roadmap do motor (fora do piloto atual)

Itens discutidos mas **não implementados** — candidatos ao playbook v2:

- [ ] Assunto livre (texto) no marketing
- [ ] Editar oferta (hoje só add/delete)
- [ ] Painel web OTP (Fase 6)
- [x] Painel ops IAE (§14) — lista de clientes
- [x] Planos Free / Premium + limites (§13) — Asaas checkout link manual
- [ ] PWA nos mini-sites
- [ ] Lembretes proativos (ex.: sexta-feira)
- [ ] Templates sem IA (fallback)
- [ ] Pacote npm `packages/motor` extraído

---

## 11. Histórico de lições (adicionar após pilotos)

_Use esta seção para anotar feedback dos 3 amigos e de produção._

| Data | Projeto | Lição |
|------|---------|-------|
| 2026-06 | IAE Smart Guide | Listas WhatsApp: máx. 10 linhas |
| 2026-06 | IAE Smart Guide | Marketing: foto + assunto antes da IA |
| 2026-06 | IAE Smart Guide | Novos projetos: WABA + app Meta dedicados (§8) |
| | | |

---

## 12. Referências internas

- `docs/prompt-replit-webhook-forward.md` — proxy webhook Meta → Railway
- `docs/Ajustes Estruturais para Páginas Satélites (Mobile-First).pdf` — layout web
- Código principal: `apps/api/src/fsm/`, `apps/api/src/services/lia-marketing.ts`, `apps/web/middleware.ts`

---

## 13. Planos Free / Premium (IAExpertise Smart Guide)

Modelo freemium acordado — **implementado no código** (`apps/api/src/services/plan.ts`).

### GRÁTIS

| Regra | Detalhe |
|--------|---------|
| Site | Completo, no ar |
| IA (Gemini) | **Não** — zero custo |
| Marketing (`divulgar`) | Bloqueado + pitch Premium |
| Propaganda | Bloco discreto no rodapé do site |
| Ofertas | Máximo **4** |
| Trial Premium | **Não** |

**Edição — duas fases**

1. **Ajuste inicial:** **2 manutenções** após o 1º site publicado (1 publicação = 1 crédito; vários campos na mesma sessão contam 1).
2. **Depois:** **1 manutenção por mês** (calendário `YYYY-MM`).

A Lia informa sempre quantos ajustes restam.

### PREMIUM — R$ 49,90/mês

| Regra | Detalhe |
|--------|---------|
| Site | Sem bloco de propaganda |
| Edição | Ilimitada |
| Marketing | Lia + Gemini |
| Ofertas | Sem limite prático |
| Cobrança | Recorrente Asaas |
| Inadimplência | Avisos até **15 dias** → downgrade automático para free (site e dados permanecem) |

### Campos no banco (`Tenant`)

- `plan`: `free` \| `premium`
- `onboardingAdjustmentsUsed`
- `maintenanceCreditsUsed` + `maintenanceCreditsPeriod`
- `premiumOverdueSince` (grace 15 dias)

### Variáveis de ambiente

- `PREMIUM_UPGRADE_URL` — link Asaas checkout
- `PREMIUM_PRICE_LABEL` — ex.: `R$ 49,90`
- `LIA_WHATSAPP_NUMBER` — CTA no banner do site
- `NEXT_PUBLIC_LIA_WHATSAPP` — mesmo número no web

### Tabela ação × plano

| Ação | Free (ajuste inicial) | Free (mensal) | Premium |
|------|------------------------|---------------|---------|
| Site público | Sim | Sim | Sim |
| Banner IAE | Sim | Sim | Não |
| Publicar alterações | 2 créditos | 1×/mês | Ilimitado |
| Ofertas (máx.) | 4 | 4 | Ilimitado |
| `divulgar` | Não | Não | Sim |

---

## 14. Painel Ops (IAE — operacional)

Painel **só para o operador** (não é dashboard do cliente). Implementado em `apps/web/app/ops` + `apps/api/src/routes/ops.ts`.

### URL

- Produção: `https://iaesmartguide.com.br/ops`
- Login: `https://iaesmartguide.com.br/ops/login`

### Autenticação

- Variável `OPS_PASSWORD` na **Vercel (web)** e **Railway (API)** — mesma senha nos dois
- Cookie httpOnly após login

### O que mostra

| Bloco | Conteúdo |
|-------|----------|
| Resumo | Total, no ar, em cadastro, free, premium |
| Lista | Nome, slug, plano, status, estado da Lia, data, links Site + WhatsApp |

### Status do cliente

| Status | Significado |
|--------|-------------|
| No ar | `is_published = true` |
| Em cadastro | Site em montagem (slug real, não publicado) |
| Só WhatsApp | Slug `pending-*` (ainda não começou cadastro) |
| Aguardando pagamento | Estado `WAITING_PAYMENT` |

### Fora do escopo (v2)

- Vitrine de clientes na home
- Toggle Premium no painel
- Gráficos e CRM

---

*Mantenha este arquivo atualizado a cada projeto derivado. Uma linha na tabela §11 vale mais que refatorar no escuro.*
