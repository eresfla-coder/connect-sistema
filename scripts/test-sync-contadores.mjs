/**
 * Teste de sincronização de contadores — espelha lib/orcamentos-local.ts
 * Executar: node scripts/test-sync-contadores.mjs
 */

const ORCAMENTOS_KEY = 'connect_orcamentos_salvos'
const ORDENS_KEY = 'connect_ordens_servico_salvas'
const DELETED_PREFIX = 'connect_orcamentos_deleted_'
const USER_ID = 'test-user-sync-001'

const store = new Map()

function storageKeyUsuario(baseKey, userId) {
  return userId ? `${baseKey}_${userId}` : baseKey
}

function lerDeletedOrcamentosIds(userId) {
  try {
    const raw = store.get(`${DELETED_PREFIX}${userId || 'anon'}`)
    const lista = raw ? JSON.parse(raw) : []
    return new Set(lista.map(String))
  } catch {
    return new Set()
  }
}

function deduplicarPorId(lista) {
  const mapa = new Map()
  for (const item of lista) {
    const id = String(item?.id ?? '')
    if (!id) continue
    mapa.set(id, item)
  }
  return Array.from(mapa.values())
}

function lerLocalStorageUsuario(baseKey, userId, fallback) {
  if (!userId) return fallback
  const scopedKey = storageKeyUsuario(baseKey, userId)
  const scopedRaw = store.get(scopedKey)
  if (scopedRaw) return JSON.parse(scopedRaw)
  const globalRaw = store.get(baseKey)
  if (!globalRaw) return fallback
  return JSON.parse(globalRaw)
}

function lerOrcamentosPainelSync(userId) {
  const deletedIds = lerDeletedOrcamentosIds(userId)
  const raw = lerLocalStorageUsuario(ORCAMENTOS_KEY, userId, [])
  const lista = Array.isArray(raw) ? raw : []
  return deduplicarPorId(lista).filter((item) => {
    const id = String(item.id ?? '')
    return id && !deletedIds.has(id)
  })
}

function lerOrdensPainelSync(userId) {
  const raw = lerLocalStorageUsuario(ORDENS_KEY, userId, [])
  const lista = Array.isArray(raw) ? raw : []
  return deduplicarPorId(lista)
}

function contarOrcamentosPainelSync(userId) {
  return lerOrcamentosPainelSync(userId).length
}

function contarDocumentosPainelSync(userId) {
  return contarOrcamentosPainelSync(userId) + lerOrdensPainelSync(userId).length
}

function salvarOrcamentosPainel(userId, lista) {
  store.set(storageKeyUsuario(ORCAMENTOS_KEY, userId), JSON.stringify(lista))
}

function limparChavesGlobaisAposMigracao(userId) {
  if (!userId) return
  for (const baseKey of [ORCAMENTOS_KEY, ORDENS_KEY]) {
    if (store.has(storageKeyUsuario(baseKey, userId))) {
      store.delete(baseKey)
    }
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FALHOU:', msg)
    process.exit(1)
  }
  console.log('✓', msg)
}

function seedLegacyGlobal(count = 11) {
  const lista = Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    numero: String(i + 1).padStart(4, '0'),
    status: 'Pendente',
  }))
  store.set(ORCAMENTOS_KEY, JSON.stringify(lista))
}

function seedScoped(count = 1) {
  const lista = Array.from({ length: count }, (_, i) => ({
    id: 5000 + i,
    numero: `S${i + 1}`,
    status: 'Pendente',
  }))
  store.set(scoped(ORCAMENTOS_KEY), JSON.stringify(lista))
}

function scoped(base) {
  return storageKeyUsuario(base, USER_ID)
}

function markDeleted(ids) {
  store.set(`${DELETED_PREFIX}${USER_ID}`, JSON.stringify(ids.map(String)))
}

console.log('--- Teste 1: scoped (1) vs global legado (11) ---')
store.clear()
seedLegacyGlobal(11)
seedScoped(1)
assert(contarOrcamentosPainelSync(USER_ID) === 1, 'Lê 1 do scoped, ignora 11 global')

console.log('--- Teste 2: exclusões ---')
markDeleted(['5000'])
assert(contarOrcamentosPainelSync(USER_ID) === 0, '0 após tombstone')

console.log('--- Teste 3: criar orçamento ---')
salvarOrcamentosPainel(USER_ID, [{ id: 9001, status: 'Pendente' }])
store.set(`${DELETED_PREFIX}${USER_ID}`, JSON.stringify([]))
assert(contarOrcamentosPainelSync(USER_ID) === 1, '1 após criar')

console.log('--- Teste 4: excluir orçamento ---')
markDeleted(['9001'])
assert(contarOrcamentosPainelSync(USER_ID) === 0, '0 após excluir')

console.log('--- Teste 5: limpar global após migração ---')
seedLegacyGlobal(11)
seedScoped(1)
store.set(`${DELETED_PREFIX}${USER_ID}`, JSON.stringify([]))
limparChavesGlobaisAposMigracao(USER_ID)
assert(!store.has(ORCAMENTOS_KEY), 'Chave global removida')
assert(contarOrcamentosPainelSync(USER_ID) === 1, 'Contagem permanece 1')

console.log('--- Teste 6: documentos orc + os ---')
store.set(scoped(ORDENS_KEY), JSON.stringify([{ id: 1 }, { id: 2 }]))
salvarOrcamentosPainel(USER_ID, [{ id: 7001, status: 'Pendente' }])
assert(contarDocumentosPainelSync(USER_ID) === 3, '3 documentos (1 orc + 2 os)')

console.log('\n✅ Todos os testes de sincronização passaram.')
