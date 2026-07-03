export type EnderecoViaCep = {
  logradouro: string
  bairro: string
  localidade: string
  uf: string
  cep: string
}

export async function buscarEnderecoPorCep(cepBruto: string): Promise<EnderecoViaCep | null> {
  const cep = String(cepBruto || '').replace(/\D/g, '')
  if (cep.length !== 8) return null

  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { cache: 'no-store' })
  if (!res.ok) return null

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!data || data.erro) return null

  return {
    logradouro: String(data.logradouro || '').trim(),
    bairro: String(data.bairro || '').trim(),
    localidade: String(data.localidade || '').trim(),
    uf: String(data.uf || '').trim(),
    cep,
  }
}
