/**
 * Regra única de vigência (acesso do cliente, banner e painel admin).
 *
 * - Fuso de negócio: America/Sao_Paulo.
 * - `vencimento` é uma data de calendário de negócio (YYYY-MM-DD) e vale até
 *   23:59:59.999 desse dia no fuso de negócio.
 * - Expirado somente quando a data de negócio atual é posterior ao vencimento.
 * - Renovação: base = vencimento (se ainda vigente) ou hoje; novo = base + dias.
 */
export const FUSO_NEGOCIO = 'America/Sao_Paulo'

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/
const RE_SEM_FUSO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/
const DIA_MS = 86_400_000

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Data de calendário de negócio (YYYY-MM-DD) do instante informado. */
export function dataNegocio(instante: Date = new Date()): string {
  const partes = formatoDia.formatToParts(instante)
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value || ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

function diaValido(dia: string): boolean {
  const m = RE_DIA.exec(dia)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === dia
}

/**
 * Normaliza um vencimento para data de negócio.
 * Datas sem fuso (coluna `date`) são mantidas; instantes com fuso (timestamptz)
 * são convertidos para o dia correspondente em America/Sao_Paulo.
 */
export function diaVencimento(valor?: string | Date | null): string | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : dataNegocio(valor)
  const texto = String(valor).trim()
  if (RE_SEM_FUSO.test(texto)) {
    const dia = texto.slice(0, 10)
    return diaValido(dia) ? dia : null
  }
  const instante = new Date(texto)
  return Number.isNaN(instante.getTime()) ? null : dataNegocio(instante)
}

function diaParaUtcMs(dia: string): number {
  const m = RE_DIA.exec(dia) as RegExpExecArray
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Dias de calendário de negócio até o vencimento (0 = vence hoje, negativo = vencido). */
export function diasAteVencimento(valor?: string | Date | null, agora: Date = new Date()): number | null {
  const dia = diaVencimento(valor)
  if (!dia) return null
  return Math.round((diaParaUtcMs(dia) - diaParaUtcMs(dataNegocio(agora))) / DIA_MS)
}

export function vencimentoExpirado(valor?: string | Date | null, agora: Date = new Date()): boolean {
  const dias = diasAteVencimento(valor, agora)
  return dias !== null && dias < 0
}

export function somarDiasCalendario(dia: string, dias: number): string {
  if (!diaValido(dia)) throw new Error(`Data de calendário inválida: ${dia}`)
  return new Date(diaParaUtcMs(dia) + Math.trunc(dias) * DIA_MS).toISOString().slice(0, 10)
}

function offsetFusoNegocio(instante: Date): string {
  const nome =
    new Intl.DateTimeFormat('en-US', { timeZone: FUSO_NEGOCIO, timeZoneName: 'longOffset' })
      .formatToParts(instante)
      .find((p) => p.type === 'timeZoneName')?.value || ''
  const m = /GMT([+-]\d{2})(?::?(\d{2}))?/.exec(nome)
  if (!m) return '+00:00'
  return `${m[1]}:${m[2] || '00'}`
}

/** Último instante (ISO UTC) em que o dia de negócio ainda é vigente. */
export function fimDoDiaNegocioIso(dia: string): string {
  if (!diaValido(dia)) throw new Error(`Data de calendário inválida: ${dia}`)
  const offset = offsetFusoNegocio(new Date(`${dia}T12:00:00Z`))
  return new Date(`${dia}T23:59:59.999${offset}`).toISOString()
}

/** Maior entre duas datas de negócio (YYYY-MM-DD); ignora valores inválidos. */
export function maiorDia(a?: string | null, b?: string | null): string | null {
  const da = diaVencimento(a)
  const db = diaVencimento(b)
  if (!da) return db
  if (!db) return da
  return da >= db ? da : db
}

/** Nova data de vencimento após um período pago de `dias`. */
export function calcularNovoVencimentoPago(
  vencimentoAtual: string | Date | null | undefined,
  dias: number,
  agora: Date = new Date(),
): string {
  const hoje = dataNegocio(agora)
  const atual = diaVencimento(vencimentoAtual)
  const base = atual && atual >= hoje ? atual : hoje
  return somarDiasCalendario(base, dias)
}
