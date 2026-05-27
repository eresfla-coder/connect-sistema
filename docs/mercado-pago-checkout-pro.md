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

### Cartão (recorrente ou Checkout Pro)

1. O cliente escolhe plano em `/assinatura` ou `/planos`.
2. **Assinar no cartão** chama `POST /api/pagamentos/checkout`.
3. A API cria um registro pendente em `pagamentos`.
4. Mensal: assinatura recorrente (preapproval). Anual: Checkout Pro.
5. O cliente é redirecionado para o Mercado Pago.
6. O webhook processa `payment` ou `preapproval`.
7. Se aprovado, atualiza `pagamentos`, `assinaturas` e `perfis`.

### PIX mensal (avulso)

1. **Pagar com PIX** chama `POST /api/mercado-pago/pix`.
2. A API cria pagamento com `payment_method_id: pix` e exibe QR Code na tela.
3. O webhook `payment` com `metadata.tipo = pix` ativa o plano por **30 dias** sem renovação automática.
4. O cliente pode consultar status com `GET /api/mercado-pago/pix?pagamentoId=...`.

## Observação de segurança

O token do Mercado Pago fica apenas no backend. A tela de planos recebe somente a URL de checkout.
