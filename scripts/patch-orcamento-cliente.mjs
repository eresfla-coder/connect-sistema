import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docPath = path.join(root, 'components/documentos/OrcamentoDocumentoPage.tsx')
let doc = fs.readFileSync(docPath, 'utf8')

function mustReplace(label, from, to) {
  if (!doc.includes(from)) {
    if (doc.includes(to.slice(0, 40))) {
      console.log('SKIP (already):', label)
      return
    }
    throw new Error('MISSING: ' + label)
  }
  doc = doc.replace(from, to)
  console.log('OK:', label)
}

mustReplace(
  'import pagamento',
  "import { urlQrCode } from '@/lib/pdfPremium'",
  "import { urlQrCode } from '@/lib/pdfPremium'\nimport { iconeFormaPagamento, listaFormasPagamentoOrcamento, textoPagamentoOrcamento } from '@/lib/orcamento-pagamento'",
)

mustReplace(
  'type fields',
  '  observacoesProposta?: string\n  aprovacaoDigital?:',
  '  observacoesProposta?: string\n  formasPagamentoLista?: string[]\n  observacaoPagamento?: string\n  ocultarValorUnitarioM2?: boolean\n  aprovacaoDigital?:',
)

mustReplace(
  'quantidadeItem',
  `function quantidadeItem(item: ItemOrcamento) {
  if (item.tipoCalculo === 'peso') {
    return Number(item.quantidade || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
      useGrouping: false,
    })
  }
  return numero(Number(item.quantidade || 0))
}`,
  `function quantidadeItem(item: ItemOrcamento, ocultarM2 = false) {
  if (ocultarM2 && item.tipoCalculo === 'm2') {
    const met = Number(item.metragem || 0)
    return met.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' m²'
  }
  if (item.tipoCalculo === 'peso') {
    return Number(item.quantidade || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
      useGrouping: false,
    })
  }
  return numero(Number(item.quantidade || 0))
}

function ocultarUnitarioItem(item: ItemOrcamento, ocultarM2: boolean) {
  return ocultarM2 && item.tipoCalculo === 'm2'
}`,
)

mustReplace(
  'decode compact',
  '      condicoesPagamento: compact.cp || compact.condicoesPagamento,\n      validadeProposta:',
  '      condicoesPagamento: compact.cp || compact.condicoesPagamento,\n      formasPagamentoLista: compact.fpl || compact.formasPagamentoLista,\n      observacaoPagamento: compact.opg || compact.observacaoPagamento,\n      ocultarValorUnitarioM2: Boolean(compact.om2 ?? compact.ocultarValorUnitarioM2),\n      validadeProposta:',
)

mustReplace(
  'serialize compact',
  "    cp: String(dados?.condicoesPagamento || ''),\n    vp:",
  "    cp: String(dados?.condicoesPagamento || ''),\n    fpl: Array.isArray(dados?.formasPagamentoLista) ? dados.formasPagamentoLista : undefined,\n    opg: String(dados?.observacaoPagamento || ''),\n    om2: Boolean(dados?.ocultarValorUnitarioM2),\n    vp:",
)

mustReplace(
  'pagamento vars',
  "  const pagamento = texto(orc.condicoesPagamento || orc.formaPagamento, 'A combinar')",
  '  const pagamento = textoPagamentoOrcamento(orc)\n  const pagamentoLista = listaFormasPagamentoOrcamento(orc)\n  const ocultarM2 = Boolean(orc.ocultarValorUnitarioM2)',
)

mustReplace(
  'screen table',
  `        <section className="orc-table orc-table-screen">
          <motionThead />
          <div className="orc-thead">
            <span>Item</span>
            <span>Descrição</span>
            <span>Un.</span>
            <span>Qtde</span>
            <span>Valor Unit.</span>
            <span>Subtotal</span>
          </div>

          {itensParaMostrar.map((item, index) => (
            <div className="orc-row" key={String(item.id || index)}>
              <motionIndex />
              <motionIndex2 />
              <div className="orc-index">{String(index + 1).padStart(2, '0')}</div>
              <div className="orc-desc">
                <strong>{texto(item.nome, 'Item')}</strong>
                {texto(item.descricao, '') && <small>{texto(item.descricao, '')}</small>}
              </div>
              <div className="orc-unit"><span>{unidadeItem(item)}</span></div>
              <div className="orc-center">{quantidadeItem(item)}</motionQty>
              <div className="orc-money">{moeda(valorUnitario(item))}</div>
              <div className="orc-line-total">{moeda(totalItem(item))}</div>
            </div>
          ))}
        </section>`,
  '',
)

mustReplace(
  'screen table real',
  `        <section className="orc-table orc-table-screen">
          <div className="orc-thead">
            <span>Item</span>
            <span>Descrição</span>
            <span>Un.</span>
            <span>Qtde</span>
            <span>Valor Unit.</span>
            <span>Subtotal</span>
          </div>

          {itensParaMostrar.map((item, index) => (
            <motionRow key={String(item.id || index)}>
              <div className="orc-index">{String(index + 1).padStart(2, '0')}</p>
              <div className="orc-desc">
                <strong>{texto(item.nome, 'Item')}</strong>
                {texto(item.descricao, '') && <small>{texto(item.descricao, '')}</small>}
              </div>
              <div className="orc-unit"><span>{unidadeItem(item)}</span></div>
              <div className="orc-center">{quantidadeItem(item)}</div>
              <div className="orc-money">{moeda(valorUnitario(item))}</div>
              <motionTotal>{moeda(totalItem(item))}</motionTotal>
            </motionRow>
          ))}
        </section>`,
  '',
)

mustReplace(
  'screen table actual',
  `        <section className="orc-table orc-table-screen">
          <div className="orc-thead">
            <span>Item</span>
            <span>Descrição</span>
            <span>Un.</span>
            <span>Qtde</span>
            <span>Valor Unit.</span>
            <span>Subtotal</span>
          </div>

          {itensParaMostrar.map((item, index) => (
            <div className="orc-row" key={String(item.id || index)}>
              <div className="orc-index">{String(index + 1).padStart(2, '0')}</div>
              <div className="orc-desc">
                <strong>{texto(item.nome, 'Item')}</strong>
                {texto(item.descricao, '') && <small>{texto(item.descricao, '')}</small>}
              </div>
              <div className="orc-unit"><span>{unidadeItem(item)}</span></motionUnit>
              <div className="orc-center">{quantidadeItem(item)}</div>
              <div className="orc-money">{moeda(valorUnitario(item))}</div>
              <motionTotal>{moeda(totalItem(item))}</motionTotal>
            </motionRow>
          ))}
        </section>`,
  '',
)

mustReplace(
  'screen table clean',
  `        <section className="orc-table orc-table-screen">
          <div className="orc-thead">
            <span>Item</span>
            <span>Descrição</span>
            <span>Un.</span>
            <span>Qtde</span>
            <span>Valor Unit.</span>
            <span>Subtotal</span>
          </div>

          {itensParaMostrar.map((item, index) => (
            <div className="orc-row" key={String(item.id || index)}>
              <div className="orc-index">{String(index + 1).padStart(2, '0')}</div>
              <div className="orc-desc">
                <strong>{texto(item.nome, 'Item')}</strong>
                {texto(item.descricao, '') && <small>{texto(item.descricao, '')}</small>}
              </div>
              <motionUnit />
              <div className="orc-unit"><span>{unidadeItem(item)}</span></div>
              <div className="orc-center">{quantidadeItem(item)}</div>
              <div className="orc-money">{moeda(valorUnitario(item))}</div>
              <div className="orc-line-total">{moeda(totalItem(item))}</div>
            </div>
          ))}
        </section>`,
  `        <section className="orc-table orc-table-screen">
          <motionThead />
          <div className={\`orc-thead \${ocultarM2 ? 'orc-thead-hide-unit' : ''}\`}>
            <span>Item</span>
            <span>Descrição</span>
            <span>Un.</span>
            <span>Qtde</span>
            {!ocultarM2 ? <span>Valor Unit.</span> : null}
            <span>Subtotal</span>
          </div>

          {itensParaMostrar.map((item, index) => (
            <div className={\`orc-row \${ocultarM2 ? 'orc-row-hide-unit' : ''}\`} key={String(item.id || index)}>
              <div className="orc-index">{String(index + 1).padStart(2, '0')}</div>
              <div className="orc-desc">
                <strong>{texto(item.nome, 'Item')}</strong>
                {texto(item.descricao, '') && <small>{texto(item.descricao, '')}</small>}
                {ocultarUnitarioItem(item, ocultarM2) && (item.largura || item.altura) ? (
                  <small>{Number(item.largura || 0).toLocaleString('pt-BR')} × {Number(item.altura || 0).toLocaleString('pt-BR')} m</small>
                ) : null}
              </div>
              <div className="orc-unit"><span>{unidadeItem(item)}</span></div>
              <div className="orc-center">{quantidadeItem(item, ocultarM2)}</div>
              {!ocultarUnitarioItem(item, ocultarM2) ? <motionUnit /> : null}
              {!ocultarUnitarioItem(item, ocultarM2) ? <motionUnit2 /> : null}
              {!ocultarUnitarioItem(item, ocultarM2) ? <div className="orc-money">{moeda(valorUnitario(item))}</div> : null}
              <div className="orc-line-total">{moeda(totalItem(item))}</div>
            </div>
          ))}
        </section>`.replace('<motionThead />\n          ', '').replace('<motionUnit />', '').replace('<motionUnit2 />', ''),
)

// Fix if motionThead left
doc = doc.replace('          <motionThead />\n          <div className={`orc-thead', '          <div className={`orc-thead')

mustReplace(
  'print table',
  `        <table className="orc-table-print">
          <thead>
            <tr>
              <th>Item</th>
              <th>Descrição</th>
              <th>Un.</th>
              <th>Qtde</th>
              <th>Valor Unit.</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {itensParaMostrar.map((item, index) => (
              <tr key={\`print-\${String(item.id || index)}\`}>
                <td>{String(index + 1).padStart(2, '0')}</td>
                <td>
                  <strong>{itemNomePrint(item)}</strong>
                  {itemDescricaoPrint(item) && <small>{itemDescricaoPrint(item)}</small>}
                </td>
                <td>{unidadeItem(item)}</td>
                <td>{quantidadeItem(item)}</td>
                <td>{moeda(valorUnitario(item))}</td>
                <td><strong>{moeda(totalItem(item))}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>`,
  `        <table className={\`orc-table-print \${ocultarM2 ? 'orc-table-print-hide-unit' : ''}\`}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Descrição</th>
              <th>Un.</th>
              <th>Qtde</th>
              {!ocultarM2 ? <th>Valor Unit.</th> : null}
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {itensParaMostrar.map((item, index) => (
              <tr key={\`print-\${String(item.id || index)}\`}>
                <td>{String(index + 1).padStart(2, '0')}</td>
                <td>
                  <strong>{itemNomePrint(item)}</strong>
                  {itemDescricaoPrint(item) && <small>{itemDescricaoPrint(item)}</small>}
                  {ocultarUnitarioItem(item, ocultarM2) && (item.largura || item.altura) ? (
                    <small>{Number(item.largura || 0).toLocaleString('pt-BR')} × {Number(item.altura || 0).toLocaleString('pt-BR')} m</small>
                  ) : null}
                </td>
                <td>{unidadeItem(item)}</td>
                <td>{quantidadeItem(item, ocultarM2)}</td>
                {!ocultarUnitarioItem(item, ocultarM2) ? <td>{moeda(valorUnitario(item))}</td> : null}
                <td><strong>{moeda(totalItem(item))}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>`,
)

mustReplace(
  'pay footer',
  `          <article className="orc-pay">
            <h3>Condições de pagamento</h3>
            <strong>{pagamento}</strong>
            {validade ? <em>Validade: {validade}</em> : null}
          </article>`,
  `          <article className="orc-pay">
            <h3>Condições de pagamento</h3>
            <div className="orc-pay-badges">
              {pagamentoLista.formas.map((forma) => (
                <span key={forma} className="orc-pay-badge">{iconeFormaPagamento(forma)} {forma}</span>
              ))}
            </div>
            {pagamentoLista.observacao ? <p className="orc-pay-note">{pagamentoLista.observacao}</p> : null}
            {!pagamentoLista.formas.length ? <strong>{pagamento}</strong> : null}
            {validade ? <em>Validade: {validade}</em> : null}
          </article>`,
)

mustReplace(
  'css grid',
  '        .orc-thead, .orc-row { display: grid; grid-template-columns: 70px 1fr 80px 90px 150px 170px; align-items: center; column-gap: 8px; }',
  '        .orc-thead, .orc-row { display: grid; grid-template-columns: 70px 1fr 80px 90px 150px 170px; align-items: center; column-gap: 8px; }\n        .orc-thead-hide-unit, .orc-row-hide-unit { grid-template-columns: 70px 1fr 80px 120px 170px; }\n        .orc-pay-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }\n        .orc-pay-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; background: var(--pdf-soft); color: var(--pdf-primary); font-size: 13px; font-weight: 900; border: 1px solid rgba(6,139,67,.18); }\n        .orc-pay-note { margin: 0 0 8px; color: #475569; font-size: 14px; line-height: 1.4; font-weight: 700; }',
)

fs.writeFileSync(docPath, doc)
console.log('DONE OrcamentoDocumentoPage')

// --- orcamentos page ---
const orcPath = path.join(root, 'app/(painel)/orcamentos/page.tsx')
let orc = fs.readFileSync(orcPath, 'utf8')

if (!orc.includes('orcamento-pagamento')) {
  orc = orc.replace(
    "import { abrirNovaAbaOuMesma, abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'",
    "import { abrirNovaAbaOuMesma, abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'\nimport {\n  extrairFormasPagamentoOrcamento,\n  montarFormasPagamentoOrcamento,\n  OPCOES_PAGAMENTO_ORCAMENTO,\n} from '@/lib/orcamento-pagamento'",
  )
}

if (!orc.includes('formasPagamentoLista?:')) {
  orc = orc.replace(
    '  formaPagamento: string\n  validade: string',
    '  formaPagamento: string\n  formasPagamentoLista?: string[]\n  observacaoPagamento?: string\n  ocultarValorUnitarioM2?: boolean\n  validade: string',
  )
}

if (!orc.includes('formasPagamentoSelecionadas')) {
  orc = orc.replace(
    "  const [formaPagamento, setFormaPagamento] = useState('PIX')\n  const [parcelasBoleto, setParcelasBoleto] = useState('')",
    "  const [formaPagamento, setFormaPagamento] = useState('PIX')\n  const [formasPagamentoSelecionadas, setFormasPagamentoSelecionadas] = useState<string[]>(['Pix'])\n  const [observacaoFormasPagamento, setObservacaoFormasPagamento] = useState('')\n  const [ocultarValorUnitarioM2, setOcultarValorUnitarioM2] = useState(false)\n  const [parcelasBoleto, setParcelasBoleto] = useState('')",
  )
}

if (!orc.includes('function formaPagamentoOrcamentoAtual')) {
  orc = orc.replace(
    'function montarFormaPagamentoFinal(base: string, parcelasBoleto?: string) {',
    `function formaPagamentoOrcamentoAtual(formas: string[], observacao: string, parcelas?: string) {
  return montarFormasPagamentoOrcamento(formas, observacao, parcelas)
}

function toggleFormaPagamentoOrcamento(label: string) {
  setFormasPagamentoSelecionadas((atual) =>
    atual.includes(label) ? atual.filter((f) => f !== label) : [...atual, label],
  )
}

function montarFormaPagamentoFinal(base: string, parcelasBoleto?: string) {`,
  )
}

// Fix - toggleFormaPagamentoOrcamento can't be outside component - need different approach
orc = fs.readFileSync(orcPath, 'utf8')
if (orc.includes('function toggleFormaPagamentoOrcamento')) {
  orc = orc.replace(/function formaPagamentoOrcamentoAtual[\s\S]*?function montarFormaPagamentoFinal/, 'function montarFormaPagamentoFinal')
}

if (!orc.includes('function pagamentoOrcamentoTexto()')) {
  orc = orc.replace(
    'function montarFormaPagamentoFinal(base: string, parcelasBoleto?: string) {',
    `function pagamentoOrcamentoTexto(formas: string[], observacao: string, parcelas?: string) {
  return montarFormasPagamentoOrcamento(formas, observacao, parcelas)
}

function montarFormaPagamentoFinal(base: string, parcelasBoleto?: string) {`,
  )
}

orc = orc.replace(/montarFormaPagamentoFinal\(formaPagamento, parcelasBoleto\)/g, 'pagamentoOrcamentoTexto(formasPagamentoSelecionadas, observacaoFormasPagamento, parcelasBoleto)')

if (!orc.includes('fpl: Array.isArray')) {
  orc = orc.replace(
    "    fp: String(dados?.formaPagamento || ''),\n    vd:",
    "    fp: String(dados?.formaPagamento || ''),\n    fpl: Array.isArray(dados?.formasPagamentoLista) ? dados.formasPagamentoLista : undefined,\n    opg: String(dados?.observacaoPagamento || ''),\n    om2: Boolean(dados?.ocultarValorUnitarioM2),\n    vd:",
  )
}

const saveBlock = `        formaPagamento: pagamentoOrcamentoTexto(formasPagamentoSelecionadas, observacaoFormasPagamento, parcelasBoleto),
        formasPagamentoLista: formasPagamentoSelecionadas,
        observacaoPagamento: observacaoFormasPagamento,
        ocultarValorUnitarioM2,`

if (!orc.includes('formasPagamentoLista: formasPagamentoSelecionadas')) {
  orc = orc.replace(
    /formaPagamento: pagamentoOrcamentoTexto\(formasPagamentoSelecionadas, observacaoFormasPagamento, parcelasBoleto\),\n/g,
    saveBlock + '\n',
  )
}

if (!orc.includes('setFormasPagamentoSelecionadas(extrair')) {
  orc = orc.replace(
    `    setFormaPagamento(String(orc.formaPagamento || 'PIX').split(' • ')[0])
    setParcelasBoleto(String(orc.formaPagamento || '').includes('•') ? String(orc.formaPagamento || '').split(' • ').slice(1).join(' • ') : '')`,
    `    const pagExtraido = extrairFormasPagamentoOrcamento(orc)
    setFormasPagamentoSelecionadas(pagExtraido.formas.length ? pagExtraido.formas : ['Pix'])
    setObservacaoFormasPagamento(pagExtraido.observacao)
    setFormaPagamento(pagExtraido.formas[0] || 'Pix')
    setParcelasBoleto(String(orc.formaPagamento || '').includes('(') ? String(orc.formaPagamento || '').match(/\\(([^)]+)\\)/)?.[1] || '' : '')
    setOcultarValorUnitarioM2(Boolean(orc.ocultarValorUnitarioM2))`,
  )
}

if (!orc.includes("setFormasPagamentoSelecionadas(['Pix'])")) {
  orc = orc.replace(
    `    setFormaPagamento(config.formaPagamentoPadrao || formasPagamento[0] || 'PIX')
    setParcelasBoleto('')`,
    `    setFormaPagamento(config.formaPagamentoPadrao || formasPagamento[0] || 'PIX')
    setFormasPagamentoSelecionadas([config.formaPagamentoPadrao || formasPagamento[0] || 'Pix'])
    setObservacaoFormasPagamento('')
    setOcultarValorUnitarioM2(false)
    setParcelasBoleto('')`,
  )
}

const paymentUiOld = `                  <motionPay />
                  <div>
                    <label style={labelStyle}>💳 Pagamento</label>
                    <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} style={inputStyle}>
                      {formasPagamento.map((forma) => (
                        <option key={forma} value={forma}>{forma}</option>
                      ))}
                    </select>
                  </div>`

const paymentUiOld2 = `                  <motionPay2 />
                  <div>
                    <label style={labelStyle}>💳 Pagamento</label>
                    <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} style={inputStyle}>
                      {formasPagamento.map((forma) => (
                        <option key={forma} value={forma}>{forma}</option>
                      ))}
                    </select>
                  </div>`

const paymentUiNew = `                  <div style={{ gridColumn: isMobile ? '1 / -1' : '1 / -1' }}>
                    <label style={labelStyle}>💳 Formas de pagamento</label>
                    <motionBadges />
                    <motionBadges2 />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      {OPCOES_PAGAMENTO_ORCAMENTO.map((opcao) => {
                        const ativo = formasPagamentoSelecionadas.includes(opcao.label)
                        return (
                          <button
                            key={opcao.id}
                            type="button"
                            onClick={() =>
                              setFormasPagamentoSelecionadas((atual) =>
                                atual.includes(opcao.label) ? atual.filter((f) => f !== opcao.label) : [...atual, opcao.label],
                              )
                            }
                            style={{
                              minHeight: 38,
                              borderRadius: 999,
                              border: ativo ? '2px solid #2563eb' : \`1px solid \${colors.inputBorder}\`,
                              background: ativo ? (darkMode ? '#1e3a8a' : '#eff6ff') : (darkMode ? '#0f172a' : '#fff'),
                              color: ativo ? (darkMode ? '#bfdbfe' : '#1d4ed8') : colors.text,
                              fontWeight: 900,
                              fontSize: 13,
                              padding: '0 14px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              boxShadow: ativo ? '0 0 16px rgba(37,99,235,.15)' : 'none',
                            }}
                          >
                            <span>{opcao.icon}</span> {opcao.label}
                          </button>
                        )
                      })}
                    </motionBadges3>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={{ ...labelStyle, fontSize: 12 }}>Observação de pagamento</label>
                      <input
                        value={observacaoFormasPagamento}
                        onChange={(e) => setObservacaoFormasPagamento(e.target.value)}
                        placeholder="Ex: Parcelamos em até 10x"
                        style={inputStyle}
                      />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontWeight: 800, color: colors.muted, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={ocultarValorUnitarioM2}
                        onChange={(e) => setOcultarValorUnitarioM2(e.target.checked)}
                      />
                      Ocultar valor unitário/m² no orçamento (cliente vê metragem e total)
                    </label>
                  </div>`.replace(/<motionBadges[^>]*\/?>/g, '').replace(/<\/motionBadges\d>/g, '')

if (orc.includes(paymentUiOld)) {
  orc = orc.replace(paymentUiOld, paymentUiNew)
} else if (orc.includes(paymentUiOld2)) {
  orc = orc.replace(paymentUiOld2, paymentUiNew)
} else if (!orc.includes('OPCOES_PAGAMENTO_ORCAMENTO.map')) {
  orc = orc.replace(
    `                  <div>
                    <label style={labelStyle}>💳 Pagamento</label>
                    <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} style={inputStyle}>
                      {formasPagamento.map((forma) => (
                        <option key={forma} value={forma}>{forma}</option>
                      ))}
                    </select>
                  </div>`,
    paymentUiNew,
  )
}

if (!orc.includes("formaPagamento.toLowerCase().includes('boleto')")) {
  // already has boleto check with formasPagamentoSelecionadas
}

orc = orc.replace(
  "{formaPagamento.toLowerCase().includes('boleto') && (",
  "{formasPagamentoSelecionadas.some((f) => f.toLowerCase().includes('boleto')) && (",
)

orc = orc.replace(
  `      if (formaPagamento.toLowerCase().includes('boleto') && parcelasBoleto) {
        mensagem += \`\${montarTextoBoleto(parcelasBoleto)}
\`
      }`,
  `      if (formasPagamentoSelecionadas.some((f) => f.toLowerCase().includes('boleto')) && parcelasBoleto) {
        mensagem += \`\${montarTextoBoleto(parcelasBoleto)}
\`
      }`,
)

fs.writeFileSync(orcPath, orc)
console.log('DONE orcamentos/page.tsx')
