export function getReciboMock(id: string) {
  return {
    id,
    numero: String(id).padStart(4, '0'),
    cliente: 'Cliente Exemplo',
    telefone: '84999999999',
    equipamento: 'Equipamento Exemplo',
    marcaModelo: 'Marca X / Modelo Y',
    valor: 70,
    entrada: 0,
    saldo: 70,
    data: new Date().toLocaleDateString(),
    observacao: 'Obrigado pela preferência.',
    empresa: {
      nome: 'LOJA CONNECT',
      endereco: 'Seu endereço aqui',
      telefone: '84999999999',
    },
  }
}