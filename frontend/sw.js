/* O build substitui a versão pelo hash dos arquivos públicos. */
const VERSION = '__SGFRUN_BUILD__'
const PREFIX = 'sgfrun-offline-'
const CACHE = PREFIX + VERSION
const local = caminho => new URL(caminho, self.registration.scope).href
const OFFLINE = local('offline.html')
const ARQUIVOS = [OFFLINE, local('assets/icons/icon-192.png'), local('assets/icons/icon-512.png')]

self.addEventListener('install', event => {
    // Atualizações aguardam confirmação. A primeira instalação ativa normalmente.
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ARQUIVOS)))
})
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const nome of await caches.keys()) if (nome.startsWith(PREFIX) && nome !== CACHE) await caches.delete(nome)
        await self.clients.claim()
    })())
})
self.addEventListener('message', event => {
    if (event.data?.type === 'APLICAR_ATUALIZACAO') event.waitUntil(self.skipWaiting())
})
self.addEventListener('fetch', event => {
    const { request } = event
    const url = new URL(request.url)
    // API, uploads, vídeos e recursos externos nunca são armazenados pelo worker.
    if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope) || /\/api(?:\/|$)/.test(url.pathname)) return
    if (request.mode !== 'navigate') return
    // HTML, JS e CSS seguem pela rede; nenhuma página de conta ou administração é guardada.
    event.respondWith(fetch(request).catch(async () => {
        return await caches.match(OFFLINE) || new Response('Sem conexão. Tente novamente ao reconectar.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }))
})
