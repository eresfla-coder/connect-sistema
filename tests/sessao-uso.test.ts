import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classificarFaixaSemUso,
  classificarStatusSessao,
  mensagemEncerramentoSessao,
  parsearUserAgent,
  rotuloStatusSessao,
  SEM_USO_7_DIAS_MS,
  SEM_USO_15_DIAS_MS,
  SEM_USO_30_DIAS_MS,
  SESSAO_INATIVO_MS,
  SESSAO_ONLINE_MS,
} from '../lib/sessao-uso.ts'

test('classifica online, inativo e offline pelos tempos centralizados', () => {
  const now = Date.parse('2026-08-23T12:00:00.000Z')
  assert.equal(classificarStatusSessao({ lastSeenAt: new Date(now).toISOString(), now }), 'online')
  assert.equal(classificarStatusSessao({ lastSeenAt: new Date(now - SESSAO_ONLINE_MS - 1000).toISOString(), now }), 'inativo')
  assert.equal(classificarStatusSessao({ lastSeenAt: new Date(now - SESSAO_INATIVO_MS - 1000).toISOString(), now }), 'offline')
  assert.equal(classificarStatusSessao({ lastSeenAt: new Date(now).toISOString(), ativo: false, now }), 'offline')
})

test('sessão encerrada pelo admin não conta como online', () => {
  assert.equal(rotuloStatusSessao('online'), '🟢 Online')
  assert.equal(mensagemEncerramentoSessao('admin'), 'Sua sessão foi encerrada pelo administrador.')
})

test('parseia navegador, sistema e dispositivo do user-agent', () => {
  const chromeWin = parsearUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  )
  assert.equal(chromeWin.navegador, 'Chrome')
  assert.equal(chromeWin.sistemaOperacional, 'Windows')
  assert.equal(chromeWin.dispositivo, 'Computador')

  const iphone = parsearUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  )
  assert.equal(iphone.navegador, 'Safari')
  assert.equal(iphone.sistemaOperacional, 'iOS')
  assert.equal(iphone.dispositivo, 'Celular')
})

test('faixas de sem uso recente 7/15/30 dias e nunca acessou', () => {
  const now = Date.parse('2026-08-23T12:00:00.000Z')
  assert.equal(classificarFaixaSemUso(null, now), 'nunca')
  assert.equal(classificarFaixaSemUso(new Date(now - 2 * 86400000).toISOString(), now), 'recente')
  assert.equal(classificarFaixaSemUso(new Date(now - SEM_USO_7_DIAS_MS - 1000).toISOString(), now), '7d')
  assert.equal(classificarFaixaSemUso(new Date(now - SEM_USO_15_DIAS_MS - 1000).toISOString(), now), '15d')
  assert.equal(classificarFaixaSemUso(new Date(now - SEM_USO_30_DIAS_MS - 1000).toISOString(), now), '30d')
})
