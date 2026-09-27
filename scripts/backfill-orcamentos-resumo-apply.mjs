/**
 * Caminho de escrita do backfill resumo de orçamentos (NÃO usado em DRY_RUN).
 *
 * Só é carregado via import dinâmico quando o entrypoint recebe --apply com
 * --plan-id=<PLAN_ID> e BACKFILL_ORCAMENTOS_CONFIRM=<PLAN_ID>, iguais ao PLAN_ID
 * recalculado contra o banco no mesmo processo. Em DRY_RUN nunca é importado.
 *
 * Cada campo é um PATCH separado, sequencial, condicionado a id + user_id +
 * local_id e ao campo AINDA estar null — não sobrescreve valor preenchido pela
 * aplicação entre o SELECT e o write (0 rows = RACE_SKIP). A representação
 * devolvida é mínima (id, updated_at, campo): payload nunca volta pela rede.
 * No primeiro erro para e devolve o progresso; nunca faz rollback automático.
 */
import { applyUpdateQuery, verifyAppliedRow } from './backfill-orcamentos-resumo-lib.mjs'

export async function applyConditionalUpdates({ url, key, updates, fetchImpl, log = () => {} }) {
  const base = `${url.replace(/\/$/, '')}/rest/v1/orcamentos`
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  const results = []
  let applied = 0
  let skipped = 0
  let responseBytes = 0
  for (const [index, u] of updates.entries()) {
    const entry = { index, id: u.match.id, user_id: u.match.user_id, local_id: u.match.local_id, field: u.requireNull }
    try {
      const res = await fetchImpl(`${base}?${applyUpdateQuery(u)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(u.set),
      })
      const text = await res.text()
      responseBytes += Buffer.byteLength(text, 'utf8')
      if (!res.ok) throw new Error(`APPLY_FAILED status=${res.status} field=${u.requireNull}`)
      let affected
      try {
        affected = JSON.parse(text)
      } catch {
        throw new Error('APPLY_FAILED: resposta não-JSON')
      }
      if (!Array.isArray(affected)) throw new Error('APPLY_FAILED: resposta inesperada')
      if (affected.length > 1) throw new Error(`APPLY_ABORT: ${affected.length} rows afetadas por um único update`)
      if (affected.length === 0) {
        skipped++
        entry.outcome = 'RACE_SKIP'
      } else {
        const problem = verifyAppliedRow(u, affected[0])
        if (problem) throw new Error(`APPLY_ABORT: ${problem} field=${u.requireNull}`)
        applied++
        entry.outcome = 'APPLIED'
        entry.updated_at = affected[0].updated_at ?? null
      }
      results.push(entry)
      log(entry)
    } catch (err) {
      entry.outcome = 'ERROR'
      entry.error = err instanceof Error ? err.message : String(err)
      results.push(entry)
      log(entry)
      return { applied, skipped, responseBytes, results, error: entry.error }
    }
  }
  return { applied, skipped, responseBytes, results, error: null }
}
