// ============================================================
// AVIGESTION - Service Worker v1.0
// PWA offline: cachea la app y sincroniza inspecciones pendientes
// Ubicación: /public/sw.js
// ============================================================

const CACHE_VERSION = 'avigestion-beta-1'
const STATIC_CACHE  = `${CACHE_VERSION}-static`
const API_CACHE     = `${CACHE_VERSION}-api`

// Recursos estáticos que SIEMPRE deben estar disponibles offline
// (las páginas no se precachean: requieren sesión y redirigen al login)
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// Rutas de API que se cachean para lectura offline
const CACHEABLE_API = [
  '/api/flocks',
  '/api/dashboard',
]

// ── INSTALL: cachear assets estáticos ────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Error cacheando assets:', err)
      })
    })
  )
  self.skipWaiting()
})

// ── ACTIVATE: limpiar caches viejos ──────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('avigestion-') && k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── FETCH: estrategia según tipo de request ───────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Solo manejar requests del mismo origen
  if (url.origin !== location.origin) return

  // POST a /api/inspections — guardar offline si no hay red
  if (request.method === 'POST' || request.method === 'PUT') {
    if (url.pathname.startsWith('/api/inspections')) {
      event.respondWith(handleInspectionMutation(request))
      return
    }
  }

  // GET a API cacheables — network first, fallback a cache
  if (CACHEABLE_API.some(p => url.pathname.startsWith(p))) {
    event.respondWith(networkFirstWithCache(request, API_CACHE))
    return
  }

  // Assets estáticos — cache first
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirstWithNetwork(request, STATIC_CACHE))
    return
  }

  // Navegación (HTML) — network first, fallback a /
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/').then(r => r || new Response('Offline', { status: 503 }))
      )
    )
    return
  }
})

// ── ESTRATEGIA: network first, fallback a cache ───────────────
async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response(JSON.stringify({ error: 'Sin conexión', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ── ESTRATEGIA: cache first, network fallback ─────────────────
async function cacheFirstWithNetwork(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Asset no disponible offline', { status: 503 })
  }
}

// ── GUARDAR INSPECCIÓN OFFLINE ────────────────────────────────
// Si no hay red, guarda en IndexedDB y registra un Background Sync
const DB_NAME = 'avigestion-offline'
const STORE   = 'pending-requests'

async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

async function savePendingRequest(request) {
  const db   = await openDB()
  const body = await request.text()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.add({
      url:       request.url,
      method:    request.method,
      body,
      headers:   Object.fromEntries(request.headers.entries()),
      timestamp: Date.now(),
    })
    tx.oncomplete = resolve
    tx.onerror    = reject
  })
}

async function handleInspectionMutation(request) {
  try {
    return await fetch(request)
  } catch {
    // Sin red — guardar localmente
    await savePendingRequest(request.clone())

    // Registrar sync para cuando vuelva la conexión
    if ('serviceWorker' in self && 'sync' in self.registration) {
      await self.registration.sync.register('sync-inspections')
    }

    // Responder con éxito "falso" para no bloquear el wizard
    return new Response(
      JSON.stringify({ data: { offline: true, queued: true }, error: null }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// ── BACKGROUND SYNC: reenviar requests pendientes ────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-inspections') {
    event.waitUntil(syncPendingRequests())
  }
})

async function syncPendingRequests() {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)

  const pending = await new Promise((resolve) => {
    const all = []
    store.openCursor().onsuccess = e => {
      const cursor = e.target.result
      if (cursor) { all.push({ id: cursor.key, ...cursor.value }); cursor.continue() }
      else resolve(all)
    }
  })

  for (const item of pending) {
    try {
      const response = await fetch(item.url, {
        method:  item.method,
        body:    item.body,
        headers: item.headers,
      })
      if (response.ok) {
        // Eliminar de la cola
        const delTx = db.transaction(STORE, 'readwrite')
        delTx.objectStore(STORE).delete(item.id)

        // Notificar a las ventanas abiertas
        const clients = await self.clients.matchAll()
        clients.forEach(c => c.postMessage({
          type: 'SYNC_SUCCESS',
          url:  item.url,
          timestamp: item.timestamp,
        }))
      }
    } catch {
      // Dejar en cola, reintentar la próxima vez
      console.log('[SW] Sync fallida, reintentando:', item.url)
    }
  }
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'AviGestión', body: event.data.text() }
  }

  const { title, body, severity, farm, house, url } = payload

  const icons = { critical: '/icons/alert-critical.png', warning: '/icons/alert-warning.png', info: '/icons/icon-192.png' }
  const badgeColors = { critical: '#ef4444', warning: '#f59e0b', info: '#22c55e' }

  event.waitUntil(
    self.registration.showNotification(title ?? 'AviGestión — Alerta', {
      body:    body ?? 'Se detectó un desvío en tu granja.',
      icon:    icons[severity] ?? icons.info,
      badge:   '/icons/badge-72.png',
      tag:     `avigestion-${severity}-${Date.now()}`,
      vibrate: severity === 'critical' ? [200, 100, 200, 100, 200] : [200, 100, 200],
      data:    { url: url ?? '/alerts', severity, farm, house },
      actions: [
        { action: 'view',   title: 'Ver alerta' },
        { action: 'dismiss', title: 'Ignorar'   },
      ],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const targetUrl = event.notification.data?.url ?? '/alerts'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const existing = clients.find(c => c.url.includes(targetUrl))
      if (existing) return existing.focus()
      return self.clients.openWindow(targetUrl)
    })
  )
})
