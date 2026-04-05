"use client";

import { use } from "react";

// Função de formatação criada direto no arquivo para evitar o erro de import
const formatDateBR = (dateString: string) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR");
};

// Interface corrigida para o Next.js 15
interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OrcamentoDetalhePage({ params }: PageProps) {
  // O Next.js 15 exige o uso de 'use' para acessar os params
  const { id } = use(params);

  return (
    <div className="min-h-screen bg-[#05070a] text-white p-8">
      <h1 className="text-2xl font-bold border-b border-orange-500 pb-4">
        Detalhes do Orçamento: <span className="text-orange-500">#{id}</span>
      </h1>
      <div className="mt-8 bg-slate-900/40 p-6 rounded-2xl border border-white/5">
        <p className="text-slate-400">Data de Geração: {formatDateBR(new Date().toISOString())}</p>
        <p className="mt-4 italic text-slate-500">Aguardando carregamento de dados do Supabase...</p>
      </div>
    </div>
  );
}
