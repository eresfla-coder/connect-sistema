export type ChecklistItemId =
  | 'cliente'
  | 'proposta'
  | 'whatsapp'
  | 'aprovacao'
  | 'os'

export type ChecklistItem = {
  id: ChecklistItemId
  titulo: string
  descricao: string
  href: string
  acao: string
}

export const CHECKLIST_ITENS: ChecklistItem[] = [
  {
    id: 'cliente',
    titulo: 'Criar primeiro cliente',
    descricao: 'Cadastre um cliente com telefone para enviar documentos.',
    href: '/clientes',
    acao: 'Abrir clientes',
  },
  {
    id: 'proposta',
    titulo: 'Criar proposta comercial',
    descricao: 'Use o modelo rápido em Orçamentos → Nova proposta.',
    href: '/orcamentos',
    acao: 'Nova proposta',
  },
  {
    id: 'whatsapp',
    titulo: 'Enviar pelo WhatsApp',
    descricao: 'Compartilhe o link do documento com o cliente.',
    href: '/orcamentos',
    acao: 'Enviar link',
  },
  {
    id: 'aprovacao',
    titulo: 'Aprovar proposta',
    descricao: 'Receba a aprovação digital ou marque como aprovado.',
    href: '/orcamentos',
    acao: 'Ver aprovações',
  },
  {
    id: 'os',
    titulo: 'Gerar ordem de serviço',
    descricao: 'Após aprovar, a OS pode ser criada automaticamente.',
    href: '/ordens-servico',
    acao: 'Abrir OS',
  },
]

const STORAGE_KEY = 'connect_checklist_progress'
const TOUR_KEY = 'connect_tour_v1_seen'

export type ChecklistProgress = Partial<Record<ChecklistItemId, boolean>>

export function lerChecklistProgress(): ChecklistProgress {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChecklistProgress) : {}
  } catch {
    return {}
  }
}

export function salvarChecklistProgress(progress: ChecklistProgress) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
    window.dispatchEvent(new Event('connect-checklist-change'))
  } catch {}
}

export function marcarChecklist(id: ChecklistItemId, done = true) {
  const atual = lerChecklistProgress()
  salvarChecklistProgress({ ...atual, [id]: done })
}

export function progressoChecklistPercent(progress?: ChecklistProgress) {
  const p = progress || lerChecklistProgress()
  const total = CHECKLIST_ITENS.length
  const done = CHECKLIST_ITENS.filter((item) => p[item.id]).length
  return total ? Math.round((done / total) * 100) : 0
}

export function checklistCompleto(progress?: ChecklistProgress) {
  const p = progress || lerChecklistProgress()
  return CHECKLIST_ITENS.every((item) => p[item.id])
}

export function tourJaVisto(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(TOUR_KEY) === '1'
  } catch {
    return true
  }
}

export function marcarTourVisto() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TOUR_KEY, '1')
  } catch {}
}

/** Detecta marcos no localStorage sem alterar lógica de negócio. */
export function detectarMarcosChecklist(): ChecklistProgress {
  if (typeof window === 'undefined') return {}
  const detectado: ChecklistProgress = {}

  try {
    const clientes = JSON.parse(localStorage.getItem('connect_clientes') || '[]')
    if (Array.isArray(clientes) && clientes.some((c: { nome?: string }) => String(c?.nome || '').trim())) {
      detectado.cliente = true
    }
  } catch {}

  try {
    const orcamentos = JSON.parse(localStorage.getItem('connect_orcamentos_salvos') || '[]')
    if (Array.isArray(orcamentos)) {
      if (orcamentos.some((o: { tipoDocumento?: string }) => String(o?.tipoDocumento || '') === 'proposta_comercial')) {
        detectado.proposta = true
      }
      if (
        orcamentos.some(
          (o: { tipoDocumento?: string; status?: string }) =>
            String(o?.tipoDocumento || '') === 'proposta_comercial' &&
            ['aprovado', 'convertido'].includes(String(o?.status || '').toLowerCase()),
        )
      ) {
        detectado.aprovacao = true
      }
    }
  } catch {}

  try {
    const os = JSON.parse(localStorage.getItem('connect_ordens_servico_salvas') || '[]')
    if (Array.isArray(os) && os.length > 0) detectado.os = true
  } catch {}

  return detectado
}

export function mesclarChecklistDetectado(): ChecklistProgress {
  const manual = lerChecklistProgress()
  const detectado = detectarMarcosChecklist()
  const merged = { ...detectado, ...manual }
  salvarChecklistProgress(merged)
  return merged
}
