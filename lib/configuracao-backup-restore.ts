/**
 * Restore de configuracoes_empresa a partir de backup.
 * O arquivo de backup não é autoridade de ownership: o tenant vem sempre do servidor.
 */

/** Colunas restauráveis (espelha o export de backup, sem colunas de ownership/controle). */
export const CONFIG_EMPRESA_CAMPOS_RESTAURAVEIS = [
  'nome_empresa',
  'tipo_pessoa',
  'cpf',
  'cnpj',
  'cep',
  'bairro',
  'telefone',
  'celular_empresa',
  'whatsapp_empresa',
  'email',
  'endereco',
  'cidade_uf',
  'responsavel',
  'logo_url',
  'cor_primaria',
  'cor_secundaria',
] as const

/**
 * Monta a linha de upsert de configuracoes_empresa.
 * Retorna null se o backup não tiver nenhum campo restaurável.
 */
export function configuracaoBackupParaRestoreRow(
  cfg: unknown,
  authorizedUserId: string,
  updatedAt: string,
): Record<string, unknown> | null {
  const userId = String(authorizedUserId || '').trim()
  if (!userId) return null
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return null

  const origem = cfg as Record<string, unknown>
  const row: Record<string, unknown> = {}
  for (const campo of CONFIG_EMPRESA_CAMPOS_RESTAURAVEIS) {
    if (Object.prototype.hasOwnProperty.call(origem, campo) && origem[campo] !== undefined) {
      row[campo] = origem[campo]
    }
  }

  if (Object.keys(row).length === 0) return null

  return { ...row, user_id: userId, updated_at: updatedAt }
}
