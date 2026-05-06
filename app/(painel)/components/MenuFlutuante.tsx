'use client'

type Props = {
  onVisualizar: () => void
  onWhatsapp: () => void
  onCopiar: () => void
  onEditar: () => void
}

const estiloBotao = {
  width: 46,
  height: 46,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  cursor: 'pointer',
  color: '#fff',
  fontSize: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backdropFilter: 'blur(10px)',
  boxShadow: '0 10px 25px rgba(0,0,0,.25)',
} as const

export default function MenuFlutuante({
  onVisualizar,
  onWhatsapp,
  onCopiar,
  onEditar,
}: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 9999,
      }}
    >
      <button onClick={onVisualizar} title="Visualizar" style={{ ...estiloBotao, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
        👁
      </button>

      <button onClick={onWhatsapp} title="WhatsApp" style={{ ...estiloBotao, background: 'linear-gradient(135deg,#16a34a,#065f46)' }}>
        📲
      </button>

      <button onClick={onCopiar} title="Copiar" style={{ ...estiloBotao, background: 'linear-gradient(135deg,#7c3aed,#581c87)' }}>
        📋
      </button>

      <button onClick={onEditar} title="Editar" style={{ ...estiloBotao, background: 'linear-gradient(135deg,#ea580c,#9a3412)' }}>
        ✏
      </button>
    </div>
  )
}