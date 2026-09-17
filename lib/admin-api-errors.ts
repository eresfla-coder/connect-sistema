/**
 * Respostas amigáveis para APIs ADMIN.2 (sem vazar SQL/stack).
 */

export function statusAuthAdmin(error: unknown): number {
  const msg = error instanceof Error ? error.message : String(error || '')
  if (msg === 'Acesso negado.' || msg === 'Sessão ausente.' || msg === 'Sessão inválida.') return 403
  return 500
}

export function logAdminApiError(contexto: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error || '')
  console.warn(`[ADMIN.2] ${contexto}:`, msg.slice(0, 300))
}

export function respostaErroPostgresAmigavel(error: { message?: string; code?: string } | null | undefined) {
  const raw = String(error?.message || '')
  const lower = raw.toLowerCase()
  const code = String(error?.code || '')

  if (code === '23505' || lower.includes('duplicate') || lower.includes('unique')) {
    if (lower.includes('email') || lower.includes('admin_clientes_email')) {
      return {
        status: 409 as const,
        body: {
          ok: false,
          code: 'ADMIN_EMAIL_DUPLICADO',
          error: 'Já existe um cliente administrativo com este e-mail.',
        },
      }
    }
    if (lower.includes('cliente_sistema') || lower.includes('admin_cs_cliente_sistema')) {
      return {
        status: 409 as const,
        body: {
          ok: false,
          code: 'ADMIN_VINCULO_DUPLICADO',
          error: 'Este cliente já possui vínculo com o sistema selecionado.',
        },
      }
    }
    return {
      status: 409 as const,
      body: {
        ok: false,
        code: 'ADMIN_CONFLITO',
        error: 'Registro já existe. Atualize o cadastro existente ou escolha outro identificador.',
      },
    }
  }

  if (
    lower.includes('acesso_connect') ||
    lower.includes('admin_cs_acesso') ||
    lower.includes('origem=terceiro') ||
    lower.includes('connect→terceiro') ||
    lower.includes('connect->terceiro') ||
    lower.includes('bloquear origem')
  ) {
    return {
      status: 422 as const,
      body: {
        ok: false,
        code: 'ADMIN_INTEGRIDADE',
        error:
          'A alteração viola as regras da carteira administrativa (origem/acesso Connect). Ajuste os vínculos e tente novamente.',
      },
    }
  }

  if (lower.includes('admin_sistemas: não é permitido alterar origem')) {
    return {
      status: 422 as const,
      body: {
        ok: false,
        code: 'ADMIN_ORIGEM_FLIP_BLOQUEADO',
        error:
          'Este sistema possui clientes com acesso Connect vinculado. Remova ou ajuste esses vínculos antes de alterar a origem.',
      },
    }
  }

  return {
    status: 400 as const,
    body: {
      ok: false,
      code: 'ADMIN_REQUEST_INVALID',
      error: 'Não foi possível concluir a operação administrativa.',
    },
  }
}

export const COLS_ADMIN_SISTEMA =
  'id,slug,nome,origem,descricao,url,ativo,created_at,updated_at' as const

export const COLS_ADMIN_CLIENTE =
  'id,nome,nome_empresa,email,telefone,documento,observacoes,ativo,created_at,updated_at' as const

export const COLS_ADMIN_VINCULO =
  'id,cliente_id,sistema_id,status,valor,dia_vencimento,data_vencimento,inicio,fim_trial,observacoes,status_pagamento,ultimo_pagamento,acesso_connect,auth_user_id,perfil_id,created_at,updated_at' as const
