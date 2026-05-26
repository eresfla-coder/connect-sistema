/** Logs de desenvolvimento — silenciados em produção. */
const ativo = process.env.NODE_ENV !== 'production'

export function devLog(...args: unknown[]) {
  if (ativo) console.log(...args)
}

export function devWarn(...args: unknown[]) {
  if (ativo) console.warn(...args)
}
