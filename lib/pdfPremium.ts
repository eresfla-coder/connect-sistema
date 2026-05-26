/** URL de QR Code leve (sem dependência extra) para links de documentos. */
export function urlQrCode(link: string, size = 96): string {
  const alvo = String(link || '').trim()
  if (!alvo) return ''
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(alvo)}`
}

export function statusOsCor(status?: string) {
  const s = String(status || '').toLowerCase()
  if (s.includes('aprov') || s.includes('conclu') || s.includes('finaliz')) return { bg: '#dcfce7', fg: '#166534', border: '#86efac' }
  if (s.includes('cancel') || s.includes('recus')) return { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' }
  if (s.includes('andamento') || s.includes('execu')) return { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' }
  return { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' }
}
