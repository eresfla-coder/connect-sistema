# Assinatura Premium SaaS — Connect Sistema

## Planos

| Plano | Mensal | Anual | Usuários | Documentos/mês |
|-------|--------|-------|----------|----------------|
| Starter | R$ 49,90 | R$ 479 | 1 | 80 |
| Pro | R$ 89,90 | R$ 859 | 3 | 400 |
| Empresa | R$ 149,90 | R$ 1.439 | 10 | 5.000 |

Trial: **7 dias** (perfil + assinatura).

## Variáveis de ambiente

```env
MERCADO_PAGO_ACCESS_TOKEN=...
MERCADO_PAGO_WEBHOOK_SECRET=...
MERCADO_PAGO_ASSINATURA_RECORRENTE=true
NEXT_PUBLIC_SITE_URL=https://seu-dominio.com.br
SUPABASE_SERVICE_ROLE_KEY=...
```

## Migration SQL

Execute `supabase/migracao-assinatura-premium-saas.sql` no Supabase.

## APIs

- `GET /api/assinatura/status` — status, trial, limites
- `POST /api/assinatura/cancelar` — cancela renovação automática
- `POST /api/pagamentos/checkout` — body `{ tier, recorrencia }` ou legado `{ plano: "mensal" }`
- `POST /api/webhooks/mercado-pago` — pagamentos + preapproval (assinatura recorrente)
- `GET /api/admin/assinaturas/metricas` — MRR, trials, conversão (admin master)

## Telas

- `/planos` — comparativo Starter / Pro / Empresa
- `/assinatura` — painel do assinante (status, trocar plano, cancelar)
