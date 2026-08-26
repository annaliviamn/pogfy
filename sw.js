// Cache Service Worker
const CACHE_NOME = 'pogfy-v2';

const ARQUIVOS_ESSENCIAIS = [
  'index.html',
  'style.css',
  'app.js',
  'firebase-config.js',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NOME).then((cache) => {
      return cache.addAll(ARQUIVOS_ESSENCIAIS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) => {
      return Promise.all(
        nomes.filter((nome) => nome !== CACHE_NOME).map((nome) => caches.delete(nome))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (url.includes('spotify.com') || url.includes('firebaseio.com') || url.includes('googleapis.com') || url.includes('gstatic.com')) {
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
