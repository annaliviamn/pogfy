// Cache Service Worker
const CACHE_NOME = 'pogfy-v2';

// Arquivos que ficam salvos localmente
const ARQUIVOS_ESSENCIAIS = [
    'index.html',
    'style.css',
    'app.js',
    'firebase-config.js',
    'manifest.json'
];

// Instalando, guarda os arquivos essenciais no cache
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NOME).then((cache) => {
            return cache.addAll(ARQUIVOS_ESSENCIAIS);
        })
    );
});

// Intercepta os pedidos de rede
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    if(url.includes('spotify.com') || url.includes('firebaseio.com') || url.includes('googleapis.com') || url.includes('gstatic.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request).then((resposta) => {
                return resposta || fetch(event.request);
            });
        })
    );
});