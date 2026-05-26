import fs from 'fs'
import path from 'path'

const file = path.join(process.cwd(), 'app/admin/page.tsx')
let c = fs.readFileSync(file, 'utf8')

const patches = [
  [
    `import AdminAssinaturasMetricas from '@/components/admin/AdminAssinaturasMetricas'`,
    `import AdminAssinaturasMetricas from '@/components/admin/AdminAssinaturasMetricas'
import ModalRenovacaoManual, { type FormRenovacao } from '@/components/admin/ModalRenovacaoManual'
import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'
import type { ReciboRenovacaoManual } from '@/lib/renovacaoManual'`,
  ],
  [
    `  const [invitePhone, setInvitePhone] = useState('')
  const [isMobileAdmin, setIsMobileAdmin] = useState(false)`,
    `  const [invitePhone, setInvitePhone] = useState('')
  const [renovarOpen, setRenovarOpen] = useState(false)
  const [renovarCliente, setRenovarCliente] = useState<PerfilAdmin | null>(null)
  const [renovarProcessando, setRenovarProcessando] = useState(false)
  const [renovarResultado, setRenovarResultado] = useState<{
    mensagemWhatsapp: string
    whatsappUrl: string
    recibo: ReciboRenovacaoManual
  } | null>(null)
  const [isMobileAdmin, setIsMobileAdmin] = useState(false)`,
  ],
  [
    `  async function marcarPago(id: string) {
    await ativar(30, id)
  }`,
    `  function abrirRenovacaoManual(cliente: PerfilAdmin) {
    setRenovarCliente(cliente)
    setRenovarResultado(null)
    setRenovarOpen(true)
    setAcaoId(null)
  }

  async function confirmarRenovacaoManual(form: FormRenovacao) {
    if (!renovarCliente) return
    try {
      setRenovarProcessando(true)
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.')

      const valor = parseMoney(form.valor_pago)
      const response = await fetch('/api/admin/clientes/renovar-manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: \`Bearer \${accessToken}\`,
        },
        body: JSON.stringify({
          user_id: renovarCliente.id,
          plano_tier: form.plano_tier,
          valor_pago: valor,
          forma_pagamento: form.forma_pagamento,
          data_pagamento: form.data_pagamento,
          proxima_validade: form.proxima_validade,
          observacao: form.observacao,
          admin_email: session?.user?.email || '',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível renovar o cliente.')

      setRenovarResultado({
        mensagemWhatsapp: String(payload.mensagemWhatsapp || ''),
        whatsappUrl: String(payload.whatsappUrl || ''),
        recibo: payload.recibo,
      })
      await refreshClientes()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao renovar.'
      alert(msg)
    } finally {
      setRenovarProcessando(false)
    }
  }

  function fecharRenovacaoManual() {
    setRenovarOpen(false)
    setRenovarCliente(null)
    setRenovarResultado(null)
  }`,
  ],
  [
    `    window.open(\`https://wa.me/\${whatsappDestino(cliente.telefone)}?text=\${encodeURIComponent(mensagem)}\`, '_blank')
  }

  function mensagemUpgrade(cliente: PerfilAdmin) {`,
    `    abrirWhatsappUrl(montarUrlWhatsapp(whatsappDestino(cliente.telefone), mensagem))
  }

  function mensagemUpgrade(cliente: PerfilAdmin) {`,
  ],
  [
    `    window.open(\`https://wa.me/\${whatsappDestino(cliente.telefone)}?text=\${encodeURIComponent(mensagem)}\`, '_blank')
  }

  function copiarResumoExecutivo() {`,
    `    abrirWhatsappUrl(montarUrlWhatsapp(whatsappDestino(cliente.telefone), mensagem))
  }

  function copiarResumoExecutivo() {`,
  ],
  [
    `                            <button style={styles.menuItem} disabled={loadingAction || isPermanent(cliente)} onClick={() => marcarPago(cliente.id)}>Marcar pago</button>`,
    `                            <button style={styles.menuItem} disabled={loadingAction || isPermanent(cliente)} onClick={() => abrirRenovacaoManual(cliente)}>Renovar sistema / Marcar pago</button>`,
  ],
  [
    `        </Modal>
      )}
    </div>
  )
}

function KpiCard({ titulo, valor, detalhe, cor, icone }: { titulo: string; valor: string; detalhe: string; cor: string; icone: string }) {`,
    `        </Modal>
      )}

      <ModalRenovacaoManual
        aberto={renovarOpen}
        cliente={renovarCliente}
        processando={renovarProcessando}
        onFechar={fecharRenovacaoManual}
        onConfirmar={confirmarRenovacaoManual}
        resultado={renovarResultado}
      />
    </div>
  )
}

function KpiCard({ titulo, valor, detalhe, cor, icone }: { titulo: string; valor: string; detalhe: string; cor: string; icone: string }) {`,
  ],
]

for (const [from, to] of patches) {
  if (c.includes(to)) {
    console.log('skip exists')
    continue
  }
  if (!c.includes(from)) {
    console.error('MISSING', from.slice(0, 60))
    process.exit(1)
  }
  c = c.replace(from, to)
  console.log('patched')
}

fs.writeFileSync(file, c, 'utf8')
console.log('admin done')
