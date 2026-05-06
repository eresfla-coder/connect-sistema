// V64: service worker autodestrutivo. Mantém estabilidade: não cacheia nada.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    } catch {}
    try {
      await self.registration.unregister()
    } catch {}
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      clients.forEach((client) => client.navigate(client.url))
    } catch {}
  })())
})

self.addEventListener('fetch', () => {
  // Intencionalmente vazio: sem cache, sem interceptação e sem risco de travamento.
})
