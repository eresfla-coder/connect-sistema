export type EntradaCalculoPrecoM2 = {
  custoMateriaPrima: number
  margemPerdaPct: number
  custoMaoObra: number
  despesasLucroPct: number
}

export type ResultadoCalculoPrecoM2 = {
  ok: boolean
  erro?: string
  precoSugeridoM2: number
  custoMaterialReal: number
  custoDiretoTotal: number
  perdaDecimal: number
  variaveisDecimal: number
}

export function calcularPrecoM2Markup(entrada: EntradaCalculoPrecoM2): ResultadoCalculoPrecoM2 {
  const custoMateriaPrima = Math.max(0, Number(entrada.custoMateriaPrima) || 0)
  const margemPerdaPct = Math.max(0, Number(entrada.margemPerdaPct) || 0)
  const custoMaoObra = Math.max(0, Number(entrada.custoMaoObra) || 0)
  const despesasLucroPct = Math.max(0, Number(entrada.despesasLucroPct) || 0)

  const perdaDecimal = margemPerdaPct / 100
  const variaveisDecimal = despesasLucroPct / 100

  const baseVazio = {
    precoSugeridoM2: 0,
    custoMaterialReal: 0,
    custoDiretoTotal: 0,
    perdaDecimal,
    variaveisDecimal,
  }

  if (!Number.isFinite(variaveisDecimal) || variaveisDecimal >= 1) {
    return {
      ok: false,
      erro: 'A soma de despesas + lucro precisa ser menor que 100%.',
      ...baseVazio,
    }
  }

  const custoMaterialReal = custoMateriaPrima * (1 + perdaDecimal)
  const custoDiretoTotal = custoMaterialReal + custoMaoObra
  const divisor = 1 - variaveisDecimal

  if (divisor <= 0 || !Number.isFinite(custoDiretoTotal)) {
    return {
      ok: false,
      erro: 'Não foi possível calcular. Verifique os valores informados.',
      ...baseVazio,
      custoMaterialReal,
      custoDiretoTotal,
    }
  }

  const precoSugeridoM2 = custoDiretoTotal / divisor

  if (!Number.isFinite(precoSugeridoM2) || precoSugeridoM2 < 0) {
    return {
      ok: false,
      erro: 'Não foi possível calcular. Verifique os valores informados.',
      ...baseVazio,
      custoMaterialReal,
      custoDiretoTotal,
    }
  }

  return {
    ok: true,
    precoSugeridoM2,
    custoMaterialReal,
    custoDiretoTotal,
    perdaDecimal,
    variaveisDecimal,
  }
}

export function moedaPrecoM2(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
