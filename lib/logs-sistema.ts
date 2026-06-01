export type AcaoLog =
  | 'criou_orcamento'
  | 'editou_orcamento'
  | 'excluiu_orcamento'
  | 'criou_os'
  | 'editou_os'
  | 'excluiu_os'
  | 'alterou_cliente'
  | 'restaurou_backup'
  | 'criou_backup'
  | 'pagamento_aprovado'
  | 'login'
  | 'logout'

export async function registrarLogSistema(
  accessToken: string,
  acao: AcaoLog,
  extras?: { modulo?: string; referencia_id?: string; detalhes?: Record<string, unknown> }
) {
  if (!accessToken) return
  try {
    await fetch('/api/logs-sistema', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        acao,
        modulo: extras?.modulo,
        referencia_id: extras?.referencia_id,
        detalhes: extras?.detalhes,
      }),
    })
  } catch {
    // não bloquear UX se log falhar
  }
}
