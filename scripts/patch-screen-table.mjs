import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '../components/documentos/OrcamentoDocumentoPage.tsx')
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('        <section className="orc-table orc-table-screen">')
const end = s.indexOf('        <table className={`orc-table-print')
if (start < 0 || end < 0) throw new Error('markers not found')

const replacement = `        <section className="orc-table orc-table-screen">
          <div className={\`orc-thead \${ocultarM2 ? 'orc-thead-hide-unit' : ''}\`}>
            <span>Item</span>
            <span>Descrição</span>
            <span>Un.</span>
            <span>Qtde</span>
            {!ocultarM2 ? <span>Valor Unit.</span> : null}
            <span>Subtotal</span>
          </motionThead>
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
              <motionQty />
              <div className="orc-center">{quantidadeItem(item, ocultarM2)}</div>
              {!ocultarUnitarioItem(item, ocultarM2) ? <div className="orc-money">{moeda(valorUnitario(item))}</div> : null}
              <div className="orc-line-total">{moeda(totalItem(item))}</div>
            </div>
          ))}
        </section>

`

const clean = replacement.replace('          </motionThead>\n          </div>', '          </motionThead>\n          </div>').replace('<motionThead />\n          </div>', '</motionThead>\n          </motionThead>\n          </div>').replace('<motionThead />\n          </div>', '</div>').replace('</motionThead>\n          </motionThead>\n          </motionThead>\n          </motionThead>\n          </div>', '</motionThead>\n          </div>').replace('<motionThead />\n          </div>', '</div>').replace('</motionThead>\n          </div>', '</div>').replace('<motionQty />\n              ', '')

const finalReplacement = `        <section className="orc-table orc-table-screen">
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
              <motionDesc />
              <div className="orc-desc">
                <strong>{texto(item.nome, 'Item')}</strong>
                {texto(item.descricao, '') && <small>{texto(item.descricao, '')}</small>}
                {ocultarUnitarioItem(item, ocultarM2) && (item.largura || item.altura) ? (
                  <small>{Number(item.largura || 0).toLocaleString('pt-BR')} × {Number(item.altura || 0).toLocaleString('pt-BR')} m</small>
                ) : null}
              </div>
              <div className="orc-unit"><span>{unidadeItem(item)}</span></div>
              <div className="orc-center">{quantidadeItem(item, ocultarM2)}</div>
              {!ocultarUnitarioItem(item, ocultarM2) ? <div className="orc-money">{moeda(valorUnitario(item))}</div> : null}
              <div className="orc-line-total">{moeda(totalItem(item))}</div>
            </div>
          ))}
        </section>

`.replace('<motionDesc />\n              ', '')

s = s.slice(0, start) + finalReplacement + s.slice(end)
fs.writeFileSync(p, s)
console.log('screen table patched')
