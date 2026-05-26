'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { calcularPrecoM2Markup, moedaPrecoM2, type ResultadoCalculoPrecoM2 } from '@/lib/calcularPrecoM2'

type Props = {
  aberto: boolean
  isMobile: boolean
  onFechar: () => void
  onUsarPreco: (precoM2: number) => void
}

function aplicarMascaraDecimal(valor: string) {
  const somenteDigitos = String(valor || '').replace(/\D/g, '')
  if (!somenteDigitos) return ''
  const inteiro = somenteDigitos.slice(0, -2) || '0'
  const decimal = somenteDigitos.slice(-2).padStart(2, '0')
  return Number(`${inteiro}.${decimal}`).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function textoDecimalParaNumero(valor: string) {
  const somenteDigitos = String(valor || '').replace(/\D/g, '')
  if (!somenteDigitos) return 0
  return Number(somenteDigitos) / 100
}

function textoPercentualParaNumero(valor: string) {
  const texto = String(valor || '').trim().replace('%', '').replace(/\./g, '').replace(',', '.')
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

function formatarDecimalVisual(valor: number) {
  if (!Number.isFinite(valor) || valor <= 0) return ''
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const label: CSSProperties = {
  display: 'block',
  color: '#475569',
  fontWeight: 900,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  marginBottom: 5,
}

const input: CSSProperties = {
  width: '100%',
  height: 42,
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#f8fbff',
  color: '#0f172a',
  padding: '0 12px',
  boxSizing: 'border-box',
  outline: 'none',
  fontSize: 15,
}

const btn: CSSProperties = {
  height: 42,
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  padding: '0 16px',
  cursor: 'pointer',
  fontWeight: 900,
  fontSize: 13,
  background: '#fff',
  color: '#0f172a',
}

export function CalculadoraPrecoM2Modal({ aberto, isMobile, onFechar, onUsarPreco }: Props) {
  const [custoMateria, setCustoMateria] = useState('')
  const [margemPerda, setMargemPerda] = useState('10')
  const [custoMaoObra, setCustoMaoObra] = useState('')
  const [despesasLucro, setDespesasLucro] = useState('')
  const [resultado, setResultado] = useState<ResultadoCalculoPrecoM2 | null>(null)
  const [erroCalc, setErroCalc] = useState('')

  useEffect(() => {
    if (!aberto) return
    setResultado(null)
    setErroCalc('')
  }, [aberto])

  function calcular() {
    const res = calcularPrecoM2Markup({
      custoMateriaPrima: textoDecimalParaNumero(custoMateria),
      margemPerdaPct: textoPercentualParaNumero(margemPerda),
      custoMaoObra: textoDecimalParaNumero(custoMaoObra),
      despesasLucroPct: textoPercentualParaNumero(despesasLucro),
    })
    if (!res.ok) {
      setResultado(null)
      setErroCalc(res.erro || 'Não foi possível calcular.')
      return
    }
    setErroCalc('')
    setResultado(res)
  }

  function usarPreco() {
    if (!resultado?.ok || resultado.precoSugeridoM2 <= 0) {
      calcular()
      return
    }
    onUsarPreco(Number(resultado.precoSugeridoM2.toFixed(2)))
    onFechar()
  }

  const resumo = useMemo(() => {
    if (!resultado?.ok) return null
    return [
      { titulo: 'Material com perda', valor: moedaPrecoM2(resultado.custoMaterialReal) },
      { titulo: 'Mão de obra', valor: moedaPrecoM2(textoDecimalParaNumero(custoMaoObra)) },
      { titulo: 'Custo direto total', valor: moedaPrecoM2(resultado.custoDiretoTotal) },
      {
        titulo: 'Despesas + lucro',
        valor: `${textoPercentualParaNumero(despesasLucro).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
      },
    ]
  }, [resultado, custoMaoObra, despesasLucro])

  if (!aberto || typeof document === 'undefined') return null

  const panel = (
    <div
      className="connect-calc-m2-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 16,
        background: 'rgba(15,23,42,.55)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calc-m2-titulo"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: isMobile ? 'min(92dvh, 720px)' : '88vh',
          background: '#fff',
          borderRadius: isMobile ? '22px 22px 0 0' : 24,
          boxShadow: '0 30px 90px rgba(15,23,42,.28)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: isMobile ? 'connectCalcM2SlideUp .28s ease' : 'connectCalcM2Fade .22s ease',
        }}
      >
        <div
          style={{
            padding: '16px 18px 12px',
            borderBottom: '1px solid #e2e8f0',
            background: 'linear-gradient(135deg,#f8fafc,#eff6ff)',
          }}
        >
          {isMobile ? (
            <div style={{ width: 44, height: 5, borderRadius: 999, background: '#cbd5e1', margin: '0 auto 12px' }} />
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1.2, textTransform: 'uppercase', color: '#2563eb' }}>
                Assistente Connect
              </div>
              <h2 id="calc-m2-titulo" style={{ margin: '4px 0 0', fontSize: isMobile ? 20 : 22, fontWeight: 950, color: '#0f172a' }}>
                Preço ideal por m²
              </h2>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
                Use esta calculadora para incluir perda de material, mão de obra, taxas e lucro no preço final.
              </p>
            </div>
            <button type="button" onClick={onFechar} style={{ ...btn, minWidth: 40, padding: 0 }} aria-label="Fechar">
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'grid', gap: 12 }}>
          <div>
            <label style={label}>Custo da matéria-prima por m²</label>
            <input
              value={custoMateria}
              onChange={(e) => setCustoMateria(aplicarMascaraDecimal(e.target.value))}
              placeholder="0,00"
              inputMode="decimal"
              style={input}
            />
          </div>
          <div>
            <label style={label}>Margem de perda / desperdício (%)</label>
            <input
              value={margemPerda}
              onChange={(e) => setMargemPerda(e.target.value.replace(/[^0-9,.]/g, ''))}
              placeholder="10"
              inputMode="decimal"
              style={input}
            />
          </div>
          <div>
            <label style={label}>Custo de mão de obra / tempo por m²</label>
            <input
              value={custoMaoObra}
              onChange={(e) => setCustoMaoObra(aplicarMascaraDecimal(e.target.value))}
              placeholder="0,00"
              inputMode="decimal"
              style={input}
            />
          </div>
          <div>
            <label style={label}>Despesas + lucro desejado (%)</label>
            <input
              value={despesasLucro}
              onChange={(e) => setDespesasLucro(e.target.value.replace(/[^0-9,.]/g, ''))}
              placeholder="Ex: 50"
              inputMode="decimal"
              style={input}
            />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', fontWeight: 700 }}>
              Impostos + taxa cartão + lucro. Ex: 50
            </p>
          </div>

          {erroCalc ? (
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              {erroCalc}
            </div>
          ) : null}

          {resultado?.ok ? (
            <div
              style={{
                borderRadius: 18,
                padding: 14,
                background: 'linear-gradient(135deg,#eff6ff,#ecfdf5)',
                border: '2px solid #2563eb',
                boxShadow: '0 12px 32px rgba(37,99,235,.12)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 950, textTransform: 'uppercase', color: '#1d4ed8', letterSpacing: 1 }}>
                Preço sugerido por m²
              </div>
              <div style={{ fontSize: isMobile ? 28 : 32, fontWeight: 950, color: '#0f172a', marginTop: 6 }}>
                {moedaPrecoM2(resultado.precoSugeridoM2)}
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                {resumo?.map((item) => (
                  <div
                    key={item.titulo}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#334155',
                    }}
                  >
                    <span>{item.titulo}</span>
                    <strong>{item.valor}</strong>
                  </div>
                ))}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 14,
                    fontWeight: 950,
                    color: '#1d4ed8',
                    paddingTop: 6,
                    borderTop: '1px dashed #93c5fd',
                  }}
                >
                  <span>Preço final sugerido</span>
                  <span>{moedaPrecoM2(resultado.precoSugeridoM2)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            padding: isMobile ? '12px 14px calc(12px + env(safe-area-inset-bottom, 0px))' : '14px 16px',
            borderTop: '1px solid #e2e8f0',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
            gap: 8,
            background: '#fff',
          }}
        >
          <button type="button" onClick={calcular} style={{ ...btn, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none' }}>
            Calcular preço
          </button>
          <button
            type="button"
            onClick={usarPreco}
            disabled={!resultado?.ok}
            style={{
              ...btn,
              background: resultado?.ok ? '#16a34a' : '#e2e8f0',
              color: resultado?.ok ? '#fff' : '#94a3b8',
              borderColor: resultado?.ok ? '#16a34a' : '#e2e8f0',
              cursor: resultado?.ok ? 'pointer' : 'not-allowed',
            }}
          >
            Usar este preço
          </button>
          <button type="button" onClick={onFechar} style={{ ...btn, background: '#f8fafc' }}>
            Fechar
          </button>
        </div>
      </div>
      <style>{`
        @keyframes connectCalcM2SlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes connectCalcM2Fade {
          from { transform: translateY(12px) scale(.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )

  return createPortal(panel, document.body)
}
