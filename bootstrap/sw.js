const A = [
  'https://aggregator.walrus-testnet.walrus.space',
  'https://aggregator.testnet.blob.store',
]
const R = {
  '/assets/index-CtSmHfFQ.css': 'FAKE_EXPIRED_BLOB_ID',
  '/assets/index-DE0siN4F.js': 'FAKE_EXPIRED_BLOB_ID',
  '/index.html': 'FAKE_EXPIRED_BLOB_ID',
  '/versui_logo.png': 'FAKE_EXPIRED_BLOB_ID',
  '/versui_logo_compressed.png': 'FAKE_EXPIRED_BLOB_ID',
}
const M = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
}
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))
self.addEventListener('fetch', e => {
  const p = new URL(e.request.url).pathname
  const b = R[p]
  if (b)
    e.respondWith(
      (async () => {
        for (const a of A) {
          try {
            const r = await fetch(a + '/v1/blobs/by-quilt-patch-id/' + b)
            if (r.ok) {
              const ext = p.match(/\.[^.]+$/)?.[0] || ''
              const type = M[ext] || 'application/octet-stream'
              return new Response(await r.blob(), {
                headers: { 'Content-Type': type },
              })
            }
          } catch (e) {}
        }
        return new Response('expired', { status: 404 })
      })(),
    )
})
