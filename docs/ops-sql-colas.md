# Cola SQL — Ops IAE Smart Guide

Referência rápida para alterar clientes **já cadastrados** no Postgres de produção.

## Onde rodar

1. [Railway](https://railway.app) → projeto → serviço **Postgres**
2. Aba **Console**
3. Entrar no PostgreSQL:

```bash
psql -U postgres
```

O prompt deve ficar `railway=#`. SQL **não** roda no bash (`root@...:/#`).

Sair: `\q`

---

## 1. Ver o cliente

Por **slug** (recomendado):

```sql
SELECT id, slug, plan, payment_status, whatsapp_number, business_name, premium_trial_until
FROM tenants
WHERE slug = 'adega-do-toninho';
```

Anote o `id` e o `whatsapp_number` se for apagar.

---

## 2. Premium manual

Libera divulgar com IA, ofertas ilimitadas, site sem banner.

```sql
UPDATE tenants
SET
  plan = 'premium',
  payment_status = 'paid',
  premium_overdue_since = NULL,
  premium_trial_until = NULL
WHERE slug = 'adega-do-toninho';
```

Se der erro na coluna `premium_trial_until`, use:

```sql
UPDATE tenants
SET
  plan = 'premium',
  payment_status = 'paid',
  premium_overdue_since = NULL
WHERE slug = 'adega-do-toninho';
```

Confirme: deve retornar `UPDATE 1`.

---

## 3. Voltar para Free

```sql
UPDATE tenants
SET
  plan = 'free',
  payment_status = 'active',
  premium_overdue_since = NULL,
  premium_trial_until = NULL
WHERE slug = 'adega-do-toninho';
```

Sem a coluna de trial:

```sql
UPDATE tenants
SET
  plan = 'free',
  payment_status = 'active',
  premium_overdue_since = NULL
WHERE slug = 'adega-do-toninho';
```

---

## 4. Apagar cliente

Substitua `8` pelo `id` do SELECT. Troque o slug na última linha se quiser conferência extra.

```sql
BEGIN;

DELETE FROM chat_states
WHERE whatsapp_number = (SELECT whatsapp_number FROM tenants WHERE id = 8);

DELETE FROM auth_codes
WHERE whatsapp_number = (SELECT whatsapp_number FROM tenants WHERE id = 8);

UPDATE payments SET tenant_id = NULL WHERE tenant_id = 8;

DELETE FROM tenants WHERE id = 8 AND slug = 'adegatoninho';

COMMIT;
```

Fotos e produtos somem sozinhos (cascade).

**Alternativa:** painel **Ops → Remover** (só se o contato tiver tenant).

---

## 5. Confirmar

```sql
SELECT id, slug, plan, payment_status, premium_trial_until
FROM tenants
ORDER BY id;
```

---

## Extra: trial de 7 dias (Premium temporário)

Para quem já está cadastrado e você quer dar trial sem virar premium pago:

```sql
UPDATE tenants
SET
  plan = 'free',
  premium_trial_until = NOW() + INTERVAL '7 days'
WHERE slug = 'adega-do-toninho';
```

(Requer coluna `premium_trial_until` no banco.)

---

## Depois de alterar

- Mini-site: abrir com **Ctrl+F5**
- WhatsApp: testar *divulgar* se virou premium
- Novos clientes ganham trial automático no 1º site (`PREMIUM_TRIAL_DAYS=7` na API)

---

## Atalhos

| Ação | Onde |
|------|------|
| Ver tabela visual | Postgres → **Data** → `tenants` |
| SQL (premium / free / apagar) | Postgres → **Console** → `psql` |
| Lista + Remover | `/ops` no painel web |
