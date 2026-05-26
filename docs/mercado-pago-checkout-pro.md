# Mercado Pago Checkout Pro - Connect Sistema

## Variáveis de ambiente

Configure no `.env.local` e também na Vercel:

```env
MERCADO_PAGO_ACCESS_TOKEN=APP_USR_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MERCADO_PAGO_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_SITE_URL=https://seu-dominio.com.br
SUPABASE_SERVICE_ROLE_KEY=ey...
```

## Webhook

No painel do Mercado Pago, cadastre a URL:

```text
https://seu-dominio.com.br/api/webhooks/mercado-pago
```

Evento necessário:

```text
payment
```

Se `MERCADO_PAGO_WEBHOOK_SECRET` estiver configurado, o webhook valida os headers `x-signature` e `x-request-id` antes de processar o pagamento.

## Fluxo implementado

1. O cliente escolhe `Mensal` ou `Anual` em `/planos`.
2. O Connect chama `/api/pagamentos/checkout`.
3. A API cria um registro pendente em `pagamentos`.
4. A API cria a preferência no Mercado Pago Checkout Pro.
5. O cliente é redirecionado para o link oficial do Mercado Pago.
6. O webhook consulta o pagamento no Mercado Pago usando `MERCADO_PAGO_ACCESS_TOKEN`.
7. Se aprovado, o webhook atualiza `pagamentos`, `assinaturas` e libera o acesso em `perfis`.

## Observação de segurança

O token do Mercado Pago fica apenas no backend. A tela de planos recebe somente a URL de checkout.
