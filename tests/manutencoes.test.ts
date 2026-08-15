import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  calcularInicioAviso,
  calcularProximaManutencao,
  calcularStatusManutencao,
  clienteIdComoTexto,
  mesmoClienteId,
  normalizarClienteId,
  planejarNovoCiclo,
} from '../lib/manutencoes.ts'
import { parseNumeroMonetario } from '../lib/numero-monetario.ts'

test('calcula periodicidade de 3 meses', () => {
  assert.equal(calcularProximaManutencao({
    dataRealizacao: '2026-08-15',
    periodicidadeTipo: 'meses',
    periodicidadeValor: 3,
  }), '2026-11-15')
})

test('calcula periodicidade de 6 meses', () => {
  assert.equal(calcularProximaManutencao({
    dataRealizacao: '2026-08-31',
    periodicidadeTipo: 'meses',
    periodicidadeValor: 6,
  }), '2027-02-28')
})

test('calcula periodicidade de 12 meses incluindo ano bissexto', () => {
  assert.equal(calcularProximaManutencao({
    dataRealizacao: '2024-02-29',
    periodicidadeTipo: 'meses',
    periodicidadeValor: 12,
  }), '2025-02-28')
})

test('calcula periodicidade personalizada em dias e anos', () => {
  assert.equal(calcularProximaManutencao({
    dataRealizacao: '2026-08-15',
    periodicidadeTipo: 'dias',
    periodicidadeValor: 45,
  }), '2026-09-29')
  assert.equal(calcularProximaManutencao({
    dataRealizacao: '2026-08-15',
    periodicidadeTipo: 'anos',
    periodicidadeValor: 2,
  }), '2028-08-15')
})

test('aceita próxima data manual', () => {
  assert.equal(calcularProximaManutencao({
    dataRealizacao: '2026-08-15',
    periodicidadeTipo: 'manual',
    proximaDataManual: '2027-01-10',
  }), '2027-01-10')
})

test('sem recorrência não gera próxima data', () => {
  assert.equal(calcularProximaManutencao({
    dataRealizacao: '2026-08-15',
    periodicidadeTipo: 'sem_recorrencia',
  }), null)
})

test('calcula antecedência de 30 dias', () => {
  assert.equal(calcularInicioAviso('2027-08-15', 30), '2027-07-16')
})

test('classifica manutenção vencida, vencendo, próxima e em dia', () => {
  const base = { recorrencia_ativa: true, cancelada_em: null, dias_antecedencia_aviso: 30 }
  assert.equal(calcularStatusManutencao({ ...base, proxima_manutencao: '2026-08-14' }, '2026-08-15').status, 'vencida')
  assert.equal(calcularStatusManutencao({ ...base, proxima_manutencao: '2026-08-20' }, '2026-08-15').status, 'vencendo')
  assert.equal(calcularStatusManutencao({ ...base, proxima_manutencao: '2026-09-10' }, '2026-08-15').status, 'proxima')
  assert.equal(calcularStatusManutencao({ ...base, proxima_manutencao: '2026-12-15' }, '2026-08-15').status, 'em_dia')
})

test('classifica recorrência cancelada', () => {
  assert.equal(calcularStatusManutencao({
    recorrencia_ativa: false,
    cancelada_em: '2026-08-15T12:00:00Z',
    dias_antecedencia_aviso: 30,
    proxima_manutencao: '2026-09-15',
  }, '2026-08-15').status, 'cancelada')
})

test('novo ciclo preserva histórico e apenas inativa recorrência anterior', () => {
  const plano = planejarNovoCiclo('registro-anterior')
  assert.deepEqual(plano.novoRegistro, { manutencao_origem_id: 'registro-anterior' })
  assert.deepEqual(plano.atualizacaoAnterior, { recorrencia_ativa: false })
  assert.equal('data_realizacao' in plano.atualizacaoAnterior, false)
})

test('migration habilita RLS e isola as duas tabelas por auth.uid()', () => {
  const sql = readFileSync(new URL('../docs/supabase-manutencoes.sql', import.meta.url), 'utf8')
  assert.match(sql, /alter table public\.equipamentos_cliente enable row level security/i)
  assert.match(sql, /alter table public\.manutencoes enable row level security/i)
  assert.ok((sql.match(/auth\.uid\(\) = user_id/g) || []).length >= 8)
})

test('normaliza e compara cliente_id número × string', () => {
  assert.equal(normalizarClienteId(46), 46)
  assert.equal(normalizarClienteId('46'), 46)
  assert.equal(normalizarClienteId('abc'), null)
  assert.equal(normalizarClienteId('46.5'), null)
  assert.equal(clienteIdComoTexto(46), '46')
  assert.equal(mesmoClienteId(46, '46'), true)
  assert.equal(mesmoClienteId(46, 47), false)
  assert.equal(mesmoClienteId(null, '46'), false)
})

test('preserva preço de serviço salvo em formato brasileiro legado', () => {
  assert.equal(parseNumeroMonetario('R$ 1.250,90'), 1250.9)
  assert.equal(parseNumeroMonetario('250,00'), 250)
  assert.equal(parseNumeroMonetario(99.9), 99.9)
})
