/* 장기요양 계산기 — 오프라인용 서비스 워커
   파일을 고쳐서 다시 올릴 때는 아래 VERSION 숫자를 하나 올려 주세요. */
const VERSION = 'v2-2';
const CACHE = 'ltc-calc-' + VERSION;
const FONT_CACHE = 'ltc-fonts-v2';
const ASSETS = [
  './', 'index.html', 'style.css', 'anim.css', 'calc.js', 'faq.js', 'app.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'logo.png', 'og.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pretendard 글꼴: 한 번 받아 두면 인터넷이 없어도 같은 글꼴
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.open(FONT_CACHE).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // 내 파일: 인터넷이 되면 최신 것, 안 되면 저장해 둔 것
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
    );
  }
});
