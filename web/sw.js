// ═══════════════════════════════════════════════════════════
//  GOMO App v1.0 — Service Worker (Offline Music Edition)
//  • Shell: cache-first (instant load, no Chrome UI)
//  • Music: buffer-and-cache (full offline playback + seek)
//  • Range requests: sliced from cached ArrayBuffer
//  • Offline page: auto-shown when no internet
// ═══════════════════════════════════════════════════════════

const SHELL_CACHE = 'gomo-shell-v2';
const MUSIC_CACHE = 'gomo-music-v1';

const SHELL_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icon-72.png',
  '/icon-96.png',
  '/icon-128.png',
  '/icon-144.png',
  '/icon-192.png',
  '/icon-512.png',
];

// ── INSTALL — pre-cache app shell ────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// ── ACTIVATE — remove stale caches ───────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== MUSIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u   = new URL(req.url);

  // ── Music streaming / download → buffer & cache for offline ──────────────
  if (u.pathname === '/api/download') {
    e.respondWith(handleMusic(req, u));
    return;
  }

  // ── Search API → network-first, offline JSON fallback ─────────────────────
  if (u.pathname === '/api/search') {
    e.respondWith(
      fetch(req).catch(() =>
        new Response(
          JSON.stringify({ offline: true, results: [], error: 'Offline — walang internet. Buksan ang Offline Library mo.' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // ── App shell → cache-first, offline page fallback ────────────────────────
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            caches.open(SHELL_CACHE).then((c) => c.put(req, resp.clone()));
          }
          return resp;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match('/offline.html');
          return caches.match('/');
        });
    })
  );
});

// ── MUSIC HANDLER — full buffer cache + range support ─────────────────────────
async function handleMusic(request, u) {
  const cacheKey  = u.pathname + u.search;
  const rangeHdr  = request.headers.get('Range');
  const musicCache = await caches.open(MUSIC_CACHE);

  // Build a stable request key (strip Range from cache key)
  const fullReq = new Request(request.url, { method: 'GET' });

  // 1. Try cache first
  const cached = await musicCache.match(fullReq);
  if (cached) {
    if (rangeHdr) return serveRange(cached, rangeHdr);
    return cached;
  }

  // 2. Fetch from network — buffer the whole thing for reliable caching
  try {
    const resp = await fetch(request.url, { method: 'GET' });
    if (!resp.ok) return resp;

    const buf         = await resp.arrayBuffer();
    const contentType = resp.headers.get('Content-Type') || 'audio/mpeg';

    // Build a proper cacheable response (no chunked encoding)
    const toCache = new Response(buf.slice(0), {
      status:  200,
      headers: {
        'Content-Type':   contentType,
        'Content-Length': String(buf.byteLength),
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'public, max-age=604800',
      },
    });

    // Store in music cache
    musicCache.put(fullReq, toCache);

    // Tell the app a track just got cached
    const urlParams  = new URLSearchParams(u.search);
    const trackTitle = urlParams.get('title') || 'Unknown';
    notifyClients({ type: 'TRACK_CACHED', title: decodeURIComponent(trackTitle), key: cacheKey });

    // Return (with range if needed)
    const toReturn = new Response(buf.slice(0), {
      status:  200,
      headers: {
        'Content-Type':  contentType,
        'Content-Length': String(buf.byteLength),
        'Accept-Ranges': 'bytes',
      },
    });
    if (rangeHdr) return serveRange(toReturn, rangeHdr);
    return toReturn;

  } catch {
    // Network failed — return offline error
    return new Response(
      JSON.stringify({ error: 'Offline — music not in cache yet. I-play muna habang may internet.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── RANGE REQUEST SLICER ──────────────────────────────────────────────────────
async function serveRange(response, rangeHeader) {
  const buf   = await response.arrayBuffer();
  const total = buf.byteLength;
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type':  response.headers.get('Content-Type') || 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
      },
    });
  }
  const start = parseInt(match[1], 10);
  const end   = match[2] ? parseInt(match[2], 10) : total - 1;
  const slice = buf.slice(start, end + 1);

  return new Response(slice, {
    status:     206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type':   response.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range':  `bytes ${start}-${end}/${total}`,
      'Content-Length': String(slice.byteLength),
      'Accept-Ranges':  'bytes',
    },
  });
}

// ── CLIENT MESSENGER ──────────────────────────────────────────────────────────
function notifyClients(msg) {
  self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
    clients.forEach((c) => c.postMessage(msg));
  });
}

// ── MESSAGES FROM APP ─────────────────────────────────────────────────────────
self.addEventListener('message', async (e) => {
  // App asks: how many tracks are cached?
  if (e.data && e.data.type === 'GET_CACHED_TRACKS') {
    const cache  = await caches.open(MUSIC_CACHE);
    const keys   = await cache.keys();
    const tracks = keys.map((req) => {
      const u = new URL(req.url);
      const p = new URLSearchParams(u.search);
      return {
        key:   u.pathname + u.search,
        title: decodeURIComponent(p.get('title') || 'Unknown Track'),
        url:   req.url,
      };
    });
    e.source.postMessage({ type: 'CACHED_TRACKS', tracks });
  }

  // App asks: delete a cached track
  if (e.data && e.data.type === 'DELETE_TRACK') {
    const cache = await caches.open(MUSIC_CACHE);
    const keys  = await cache.keys();
    const key   = keys.find((r) => r.url === e.data.url || r.url.includes(e.data.key));
    if (key) await cache.delete(key);
    e.source.postMessage({ type: 'TRACK_DELETED', key: e.data.key });
  }
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(d.title || 'GOMO', {
      body:  d.body  || 'May bagong kanta para sa iyo!',
      icon:  '/icon-192.png',
      badge: '/icon-96.png',
      tag:   'gomo-notif',
    })
  );
});
