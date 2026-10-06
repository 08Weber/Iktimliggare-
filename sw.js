/* Offline-stöd: appen öppnas även utan täckning (t.ex. uppe på en mast).
   Strategi: nätverket först (så uppdateringar kommer fram direkt), med snabb
   reserv från cachen om nätet saknas eller är för trögt. Höj CACHE-versionen
   om du någon gång vill tvinga fram en helt ny cache. */
const CACHE = 'timmar-v1';
const CORE = ['./', 'index.html', 'style.css', 'script.js', 'logo.png', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
const SLOW_NETWORK_MS = 3000;

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(req) {
    const cache = await caches.open(CACHE);
    const fromNet = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    });
    fromNet.catch(() => {}); // undvik "unhandled rejection" om cachen redan svarat
    const slow = new Promise((resolve) => setTimeout(() => resolve(null), SLOW_NETWORK_MS));
    try {
        const first = await Promise.race([fromNet, slow]);
        if (first) return first;
        return (await cache.match(req)) || fromNet;
    } catch (err) {
        const cached = (await cache.match(req)) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
        if (cached) return cached;
        throw err;
    }
}

async function fontsStaleWhileRevalidate(req) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
    }).catch(() => null);
    return cached || (await net) || Response.error();
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(req));
    } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(fontsStaleWhileRevalidate(req));
    }
});
