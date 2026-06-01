import { gerarCsv, baixarCsv } from '@/lib/export-csv'

export function exportarClientesExcel(clientes: Record<string, unknown>[]) {
  const linhas = clientes.map((c) => ({
    id: c.id,
    nome: c.nome || c.nome_empresa,
    telefone: c.telefone || c.whatsapp,
    email: c.email,
    cidade: c.cidade,
    cpf_cnpj: c.cpfCnpj || c.cpf_cnpj,
  }))
  baixarCsv(`clientes-${new Date().toISOString().slice(0, 10)}`, gerarCsv(linhas))
}

export function exportarOrcamentosExcel(orcamentos: Record<string, unknown>[]) {
  const linhas = orcamentos.map((o) => ({
    id: o.id,
    numero: o.numero,
    cliente: o.nomeCliente || o.cliente,
    status: o.status,
    total: o.total ?? o.valorTotal,
    data: o.data || o.criadoEm,
  }))
  baixarCsv(`orcamentos-${new Date().toISOString().slice(0, 10)}`, gerarCsv(linhas))
}

export function exportarOsExcel(ordens: Record<string, unknown>[]) {
  const linhas = ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    cliente: o.nomeCliente || o.cliente,
    status: o.status,
    total: o.total ?? o.valorTotal,
    data: o.data || o.criadoEm,
  }))
  baixarCsv(`ordens-servico-${new Date().toISOString().slice(0, 10)}`, gerarCsv(linhas))
}
