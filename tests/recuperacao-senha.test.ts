import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buscaSemRecuperacao,
  classificarErroRecuperacao,
  classificarErroSenha,
  criarTrocaUnica,
  decidirInicioRecuperacao,
  hrefSemSegredo,
  lerChegadaRecuperacao,
  MSG_CONTINUAR_NA_ORIGEM,
  MSG_LINK_EXPIRADO,
  MSG_LINK_INVALIDO,
  MSG_LINK_INVALIDO_OU_EXPIRADO,
  MSG_LINK_REUTILIZADO,
  MSG_REDE,
  MSG_SEM_VERIFICADOR,
  MSG_SENHA_CURTA,
  MSG_SENHA_FALHA,
  MSG_SESSAO_AUSENTE,
  ORIGEM_CANONICA,
  temVerificadorPkce,
  validarLinkRecuperacao,
  type ClienteRecuperacao,
  type ErroAuthResumo,
} from '../lib/auth/recuperacao-senha.ts'

const CODIGO = 'pkce-codigo-teste-99'
const ACCESS = 'access-teste-nao-real'
const REFRESH = 'refresh-teste-nao-real'
const HREF_PKCE = `${ORIGEM_CANONICA}/reset-senha?code=${CODIGO}`

function clientePkce(opcoes: {
  verificador?: boolean
  initialize?: ClienteRecuperacao['initialize']
  recuperar?: boolean
  atrasar?: boolean
} = {}): ClienteRecuperacao & { chamadas: { initialize: number; sessao: number } } {
  const chamadas = { initialize: 0, sessao: 0 }
  const ouvintes: Array<() => void> = []
  return {
    chamadas,
    temVerificador: () => opcoes.verificador !== false,
    initialize: async () => {
      chamadas.initialize += 1
      if (opcoes.initialize) return opcoes.initialize()
      if (opcoes.recuperar === false) return { error: null }
      const disparar = () => ouvintes.forEach((ouvinte) => ouvinte())
      if (opcoes.atrasar) setTimeout(disparar, 0)
      else disparar()
      return { error: null }
    },
    onPasswordRecovery: (ouvinte) => {
      ouvintes.push(ouvinte)
      return () => {
        const indice = ouvintes.indexOf(ouvinte)
        if (indice >= 0) ouvintes.splice(indice, 1)
      }
    },
    definirSessao: async () => {
      chamadas.sessao += 1
      return { error: null, autenticado: true }
    },
  }
}

function naoVaza(mensagem: string) {
  assert.equal(mensagem.includes(CODIGO), false)
  assert.equal(mensagem.includes(ACCESS), false)
  assert.equal(mensagem.includes(REFRESH), false)
}

test('produção só envia o e-mail a partir da origem canônica', () => {
  const envio = decidirInicioRecuperacao(ORIGEM_CANONICA, 'Cliente@Example.com')
  assert.deepEqual(envio, {
    tipo: 'enviar',
    redirectTo: `${ORIGEM_CANONICA}/reset-senha`,
  })

  const painel = decidirInicioRecuperacao('https://painel.appconnectpro.com.br', 'cliente@example.com')
  assert.equal(painel.tipo, 'redirecionar')
  if (painel.tipo !== 'redirecionar') return
  assert.equal(
    painel.destino,
    `${ORIGEM_CANONICA}/login?recuperacao=1&email=cliente%40example.com`,
  )
  assert.equal(painel.destino.includes('/reset-senha'), false)

  const preview = decidirInicioRecuperacao('https://connect-sistema-teste.vercel.app', 'cliente@example.com')
  assert.equal(preview.tipo, 'redirecionar')
})

test('desenvolvimento preserva a origem local', () => {
  for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.0.15:3000']) {
    assert.deepEqual(decidirInicioRecuperacao(origin, 'cliente@example.com'), {
      tipo: 'enviar',
      redirectTo: `${origin}/reset-senha`,
    })
  }
})

test('a chegada na origem canônica preenche o e-mail e tira o parâmetro da barra', () => {
  const chegada = lerChegadaRecuperacao('?recuperacao=1&email=cliente@example.com&redirect=%2Fdashboard')
  assert.equal(chegada.continuar, true)
  assert.equal(chegada.email, 'cliente@example.com')
  assert.equal(MSG_CONTINUAR_NA_ORIGEM.includes('www.appconnectpro.com.br') === false, true)
  assert.equal(buscaSemRecuperacao('?recuperacao=1&email=cliente@example.com&redirect=%2Fdashboard'), '?redirect=%2Fdashboard')
})

test('a troca PKCE bem-sucedida ocorre uma vez e libera a redefinição', async () => {
  const cliente = clientePkce()
  const umaVez = criarTrocaUnica()
  const executar = () => validarLinkRecuperacao(HREF_PKCE, cliente)
  const primeira = umaVez('link-atual', executar)
  const segunda = umaVez('link-atual', executar)

  assert.equal(primeira, segunda)
  const [a, b] = await Promise.all([primeira, segunda])
  assert.deepEqual(a, { ok: true })
  assert.deepEqual(b, { ok: true })
  assert.equal(cliente.chamadas.initialize, 1)
  assert.equal(cliente.chamadas.sessao, 0)
})

test('PASSWORD_RECOVERY disparado após o initialize ainda libera a redefinição', async () => {
  const cliente = clientePkce({ atrasar: true })
  const resultado = await validarLinkRecuperacao(HREF_PKCE, cliente)
  assert.deepEqual(resultado, { ok: true })
  assert.equal(cliente.chamadas.initialize, 1)
})

test('código sem verificador não é enviado ao Supabase', async () => {
  const cliente = clientePkce({ verificador: false })
  const resultado = await validarLinkRecuperacao(HREF_PKCE, cliente)
  assert.deepEqual(resultado, { ok: false, mensagem: MSG_SEM_VERIFICADOR })
  assert.equal(cliente.chamadas.initialize, 0)
  naoVaza(resultado.ok ? '' : resultado.mensagem)
})

test('código expirado, reutilizado, inválido ou com falha de rede não libera a senha', async () => {
  const casos: Array<{ erro: ErroAuthResumo; mensagem: string }> = [
    { erro: { code: 'otp_expired', message: `expired ${CODIGO}` }, mensagem: MSG_LINK_EXPIRADO },
    { erro: { message: 'Email link is invalid or has expired' }, mensagem: MSG_LINK_INVALIDO_OU_EXPIRADO },
    { erro: { message: 'code has been used' }, mensagem: MSG_LINK_REUTILIZADO },
    { erro: { code: 'invalid_grant', message: `invalid ${CODIGO}` }, mensagem: MSG_LINK_INVALIDO },
    { erro: { name: 'AuthRetryableFetchError', status: 503 }, mensagem: MSG_REDE },
    { erro: { name: 'AuthPKCECodeVerifierMissingError' }, mensagem: MSG_SEM_VERIFICADOR },
  ]

  for (const caso of casos) {
    const cliente = clientePkce({
      initialize: async () => ({ error: caso.erro }),
    })
    const resultado = await validarLinkRecuperacao(HREF_PKCE, cliente)
    assert.deepEqual(resultado, { ok: false, mensagem: caso.mensagem })
    naoVaza(caso.mensagem)
    assert.equal(cliente.chamadas.sessao, 0)
  }
})

test('falha de rede lançada também é única sob o guarda', async () => {
  let chamadas = 0
  const cliente = clientePkce({
    initialize: async () => {
      chamadas += 1
      throw new TypeError('Failed to fetch')
    },
  })
  const umaVez = criarTrocaUnica()
  const executar = () => validarLinkRecuperacao(HREF_PKCE, cliente)
  const [a, b] = await Promise.all([
    umaVez('rede', executar),
    umaVez('rede', executar),
  ])
  assert.deepEqual(a, { ok: false, mensagem: MSG_REDE })
  assert.deepEqual(b, { ok: false, mensagem: MSG_REDE })
  assert.equal(chamadas, 1)
})

test('sessão comum sem PASSWORD_RECOVERY não autoriza a troca de senha', async () => {
  const cliente = clientePkce({ recuperar: false })
  const resultado = await validarLinkRecuperacao(HREF_PKCE, cliente)
  assert.deepEqual(resultado, { ok: false, mensagem: MSG_LINK_INVALIDO })
  assert.equal(cliente.chamadas.sessao, 0)
})

test('link antigo com hash só vale quando type=recovery e a sessão é confirmada', async () => {
  let sessoes = 0
  const cliente = clientePkce()
  cliente.definirSessao = async () => {
    sessoes += 1
    return { error: null, autenticado: true }
  }

  const valido = await validarLinkRecuperacao(
    `${ORIGEM_CANONICA}/reset-senha#access_token=${ACCESS}&refresh_token=${REFRESH}&type=recovery`,
    cliente,
  )
  assert.deepEqual(valido, { ok: true })
  assert.equal(sessoes, 1)
  assert.equal(cliente.chamadas.initialize, 0)

  const semTipo = await validarLinkRecuperacao(
    `${ORIGEM_CANONICA}/reset-senha#access_token=${ACCESS}&refresh_token=${REFRESH}&type=magiclink`,
    cliente,
  )
  assert.deepEqual(semTipo, { ok: false, mensagem: MSG_LINK_INVALIDO })
  assert.equal(sessoes, 1)

  cliente.definirSessao = async () => {
    sessoes += 1
    return { error: { message: `invalid ${ACCESS}` }, autenticado: false }
  }
  const rejeitado = await validarLinkRecuperacao(
    `${ORIGEM_CANONICA}/reset-senha#access_token=${ACCESS}&refresh_token=${REFRESH}&type=recovery`,
    cliente,
  )
  assert.equal(rejeitado.ok, false)
  if (!rejeitado.ok) naoVaza(rejeitado.mensagem)
})

test('erro de link na query não dispara troca', async () => {
  const cliente = clientePkce()
  const resultado = await validarLinkRecuperacao(
    `${ORIGEM_CANONICA}/reset-senha?error_code=otp_expired&error_description=expired`,
    cliente,
  )
  assert.deepEqual(resultado, { ok: false, mensagem: MSG_LINK_EXPIRADO })
  assert.equal(cliente.chamadas.initialize, 0)
})

test('código e tokens saem da barra de endereço', () => {
  const limpa = hrefSemSegredo(
    `${ORIGEM_CANONICA}/reset-senha?code=${CODIGO}&token_hash=${REFRESH}#access_token=${ACCESS}&refresh_token=${REFRESH}&type=recovery`,
  )
  assert.equal(limpa, '/reset-senha')
  naoVaza(limpa)
})

test('cookie do verificador é reconhecido sem devolver o valor', () => {
  assert.equal(temVerificadorPkce('outro=abc'), false)
  assert.equal(temVerificadorPkce('sb-projeto-auth-token-code-verifier=segredo'), true)
  assert.equal(temVerificadorPkce('supabase.auth.token-code-verifier.0=segredo'), true)
  assert.equal(temVerificadorPkce(''), false)
})

test('falha ao salvar a senha não repete a mensagem crua do provedor', () => {
  assert.equal(classificarErroSenha({ message: 'Password should be at least 6 characters' }), MSG_SENHA_CURTA)
  assert.equal(classificarErroSenha({ name: 'AuthSessionMissingError' }), MSG_SESSAO_AUSENTE)
  assert.equal(classificarErroSenha({ message: 'Failed to fetch' }), MSG_REDE)
  assert.equal(classificarErroSenha({ message: `unexpected ${CODIGO}` }), MSG_SENHA_FALHA)
  naoVaza(MSG_SENHA_FALHA)
})

test('a tela publicada não usa service role nem troca o código duas vezes', () => {
  const login = readFileSync('app/(auth)/login/page.tsx', 'utf8')
  const reset = readFileSync('app/reset-senha/page.tsx', 'utf8')
  const lib = readFileSync('lib/auth/recuperacao-senha.ts', 'utf8')

  assert.match(login, /decidirInicioRecuperacao\(window\.location\.origin/)
  assert.match(login, /resetPasswordForEmail/)
  assert.doesNotMatch(login, /redirectReset/)
  assert.match(reset, /validarLinkRecuperacao/)
  assert.match(reset, /hrefSemSegredo/)
  assert.match(reset, /criarTrocaUnica/)
  assert.doesNotMatch(reset, /exchangeCodeForSession\s*\(/)
  assert.doesNotMatch(lib, /exchangeCodeForSession\s*\(/)
  assert.doesNotMatch(`${login}\n${reset}\n${lib}`, /service_role|supabaseAdmin/)
})

test('classificar não ecoa o código recebido na mensagem do provedor', () => {
  const mensagem = classificarErroRecuperacao({
    code: 'invalid_grant',
    message: `bad ${CODIGO}`,
  })
  assert.equal(mensagem, MSG_LINK_INVALIDO)
  naoVaza(mensagem)
})
