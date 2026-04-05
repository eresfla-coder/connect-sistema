import React from 'react';

export default function BloqueioPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-8 text-center border border-gray-100">
        
        {/* Ícone de Cadeado */}
        <div className="flex justify-center mb-6">
          <div className="bg-red-50 p-5 rounded-full">
            <svg xmlns="http://w3.org" className="h-14 w-14 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        {/* Mensagem Principal */}
        <h1 className="text-2xl font-black text-gray-900 mb-3 uppercase">
          Acesso Suspenso
        </h1>
        
        <p className="text-gray-500 mb-10 text-sm leading-relaxed">
          Olá! Identificamos uma pendência em sua assinatura. <br/>
          <span className="font-semibold text-gray-700">Regularize agora para continuar utilizando o sistema.</span>
        </p>

        {/* Botão de WhatsApp */}
        <a 
          href="https://wa.me! Meu acesso ao sistema foi suspenso. Gostaria de regularizar." 
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-5 px-6 rounded-2xl transition-all shadow-lg active:scale-95 text-center"
        >
          LIBERAR ACESSO AGORA
        </a>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest uppercase">
            Sistema Gerenciador de OS
          </p>
        </div>
      </div>
    </div>
  );
}
