# Connect Sistema V1.0 — Relatório de Produção

## O que foi alterado

### 1. Central de Backup (Configurações → Backup e Segurança)
- Nova seção na aba **Backup e Segurança** em Configurações
- **Fazer Backup Agora**: gera JSON completo e salva na nuvem
- **Baixar Backup**: download `connect-backup-YYYY-MM-DD-HH-mm.json`
- **Restaurar Backup**: upload JSON com validação de versão, user_id e estrutura
- **Backup automático diário** (últimos 15 na nuvem)

### 2. APIs de backup e logs
- `POST/GET /api/backup` — criar e listar backups
- `POST /api/backup/restore` — restauração na nuvem
- `POST /api/logs-sistema` — auditoria
- `GET /api/admin/health` — health check
- `GET/POST /api/admin/backups` — recuperação de desastre (admin)

### 3. Admin
- Aba **Saúde do sistema** (Supabase, Mercado Pago, WhatsApp, Storage, Backup)
- **Backups do cliente** no menu Ações (desktop e mobile)

### 4. Exportação Excel (CSV UTF-8)
- Clientes, Orçamentos e OS — botão **Exportar Excel**

### 5. Auditoria
- Logs em orçamentos (criar/editar/excluir), OS (criar/editar/excluir), clientes (alterar), backup (criar/restaurar)

### 6. Multiusuário
- Dashboard filtra `orcamentos` e `ordens_servico` por `user_id`

### 7. SQL Supabase
- `supabase/migracao-producao-v1.sql` — tabelas `backups_usuario` e `logs_sistema` com RLS

## Arquivos alterados / criados

| Arquivo | Ação |
|---------|------|
| `supabase/migracao-producao-v1.sql` | Criado |
| `lib/backup-connect.ts` | Criado |
| `lib/backup-server.ts` | Criado |
| `lib/logs-sistema.ts` | Criado |
| `lib/export-csv.ts` | Criado |
| `lib/export-modulos.ts` | Criado |
| `lib/api-auth.ts` | Criado |
| `app/api/backup/route.ts` | Criado |
| `app/api/backup/restore/route.ts` | Criado |
| `app/api/logs-sistema/route.ts` | Criado |
| `app/api/admin/health/route.ts` | Criado |
| `app/api/admin/backups/route.ts` | Criado |
| `components/configuracoes/BackupSegurancaPanel.tsx` | Criado |
| `components/admin/AdminBackupsModal.tsx` | Criado |
| `app/(painel)/configuracoes/page.tsx` | Alterado |
| `app/admin/page.tsx` | Alterado |
| `app/(painel)/dashboard/page.tsx` | Alterado |
| `app/(painel)/orcamentos/page.tsx` | Alterado |
| `app/(painel)/ordens-servico/page.tsx` | Alterado |
| `app/(painel)/clientes/page.tsx` | Alterado |
| `app/(painel)/components/painel/PainelShell.tsx` | Alterado |

## Pendências restantes

1. **Executar SQL no Supabase**: `supabase/migracao-producao-v1.sql` (obrigatório para backup na nuvem e logs)
2. **Coluna `user_id` em `clientes`**: se não existir, adicionar + backfill para isolamento total
3. **RLS completo**: revisar/aplicar script RLS anterior em todas as tabelas públicas
4. **Logs login/logout/pagamento**: registrar nos fluxos de auth e webhook Mercado Pago
5. **Blindagem Date.now() em OS**: `novoId = Date.now()` ainda usado em criação de OS (deduplicação por tombstone mitiga ressurreição)
6. **Exportação .xlsx nativo**: hoje é CSV compatível com Excel (sem dependência xlsx)

## Checklist produção

- [ ] Rodar `migracao-producao-v1.sql` no Supabase
- [ ] Confirmar `SUPABASE_SERVICE_ROLE_KEY` na Vercel
- [ ] Confirmar `MERCADOPAGO_ACCESS_TOKEN` na Vercel
- [ ] Testar backup manual em Configurações
- [ ] Testar restauração em conta de teste
- [ ] Testar aba Saúde no admin
- [ ] Testar backups do cliente no admin master
- [ ] `npx tsc --noEmit` e `npm run build` sem erros
- [ ] Smoke: orçamento, OS, recibo, contrato, MP, WhatsApp, PWA
