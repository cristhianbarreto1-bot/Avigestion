// ============================================================
// AVIGESTION - PWA Hook + Offline Manager
// Registra el SW, maneja instalación y sync de datos offline
// ============================================================

'use client'

import { useEffect, useState, useCallback } from 'react'

// ── TIPOS ────────────────────────────────────────────────────

export interface PWAState {
  isInstalled:     boolean
  isInstallable:   boolean
  isOnline:        boolean
  isOffline:       boolean
  swRegistered:    boolean
  pendingSync:     number   // cantidad de requests pendientes de sincronizar
  lastSyncAt:      Date | null
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// ── STORE DE ESTADO PWA ──────────────────────────────────────

let installPrompt: BeforeInstallPromptEvent | null = null

// ── HOOK PRINCIPAL ───────────────────────────────────────────

export function usePWA(): PWAState & {
  install:         () => Promise<boolean>
  checkPendingSync: () => Promise<number>
} {
  const [state, setState] = useState<PWAState>({
    isInstalled:   false,
    isInstallable: false,
    isOnline:      typeof navigator !== 'undefined' ? navigator.onLine : true,
    isOffline:     typeof navigator !== 'undefined' ? !navigator.onLine : false,
    swRegistered:  false,
    pendingSync:   0,
    lastSyncAt:    null,
  })

  // Registrar Service Worker
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(reg => {
        setState(s => ({ ...s, swRegistered: true }))
        console.log('[PWA] Service Worker registrado:', reg.scope)

        // Escuchar mensajes del SW (sync completado)
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SYNC_SUCCESS') {
            setState(s => ({ ...s, lastSyncAt: new Date() }))
            checkPendingSync()
          }
        })
      })
      .catch(err => console.error('[PWA] Error registrando SW:', err))
  }, [])

  // Detectar si ya está instalada como PWA
  useEffect(() => {
    const isInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    setState(s => ({ ...s, isInstalled }))
  }, [])

  // Capturar evento de instalación
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      installPrompt = e as BeforeInstallPromptEvent
      setState(s => ({ ...s, isInstallable: true }))
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Detectar cambios de conectividad
  useEffect(() => {
    const setOnline  = () => {
      setState(s => ({ ...s, isOnline: true,  isOffline: false }))
      checkPendingSync()
    }
    const setOffline = () => setState(s => ({ ...s, isOnline: false, isOffline: true  }))

    window.addEventListener('online',  setOnline)
    window.addEventListener('offline', setOffline)
    return () => {
      window.removeEventListener('online',  setOnline)
      window.removeEventListener('offline', setOffline)
    }
  }, [])

  // Contar requests pendientes en IndexedDB
  const checkPendingSync = useCallback(async (): Promise<number> => {
    if (typeof window === 'undefined') return 0
    try {
      const count = await countPendingRequests()
      setState(s => ({ ...s, pendingSync: count }))
      return count
    } catch {
      return 0
    }
  }, [])

  useEffect(() => { checkPendingSync() }, [])

  // Trigger de instalación
  const install = useCallback(async (): Promise<boolean> => {
    if (!installPrompt) return false
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setState(s => ({ ...s, isInstalled: true, isInstallable: false }))
      installPrompt = null
      return true
    }
    return false
  }, [])

  return { ...state, install, checkPendingSync }
}

// ── ACCESO A INDEXEDDB (desde el main thread) ─────────────────

async function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('avigestion-offline', 1)
    req.onupgradeneeded = e => {
      ;(e.target as IDBOpenDBRequest).result.createObjectStore('pending-requests', {
        keyPath: 'id', autoIncrement: true,
      })
    }
    req.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror   = e => reject((e.target as IDBOpenDBRequest).error)
  })
}

async function countPendingRequests(): Promise<number> {
  const db = await openOfflineDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('pending-requests', 'readonly')
    const store = tx.objectStore('pending-requests')
    const req   = store.count()
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

// ── COMPONENTE: BANNER OFFLINE ────────────────────────────────

export function OfflineBanner() {
  const { isOffline, pendingSync, lastSyncAt } = usePWA()

  if (!isOffline && pendingSync === 0) return null

  return (
    <div suppressHydrationWarning style={{
      position: 'fixed', bottom: 16, left: 16, zIndex: 9999,
      background: isOffline ? '#7c2d12' : '#166534',
      border: `1px solid ${isOffline ? '#ef4444' : '#22c55e'}`,
      borderRadius: 12,
      padding: '12px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
      fontFamily: 'system-ui, sans-serif',
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      maxWidth: 280,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{isOffline ? '📡' : '🔄'}</span>
        <div>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
            {isOffline ? 'Sin conexión — modo offline' : 'Sincronizando...'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
            {isOffline
              ? `${pendingSync} inspección${pendingSync !== 1 ? 'es' : ''} pendiente${pendingSync !== 1 ? 's' : ''} de enviar`
              : lastSyncAt
                ? `Última sincronización: ${lastSyncAt.toLocaleTimeString('es-AR')}`
                : 'Enviando datos al servidor...'
            }
          </div>
        </div>
      </div>
      {isOffline && (
        <div style={{
          background: 'rgba(255,255,255,0.15)', borderRadius: 6,
          padding: '4px 10px', color: '#fff', fontSize: 11,
        }}>
          Las inspecciones se guardan localmente ✓
        </div>
      )}
    </div>
  )
}

// ── COMPONENTE: BOTÓN DE INSTALACIÓN ─────────────────────────

export function InstallPWAButton() {
  const { isInstallable, isInstalled, install } = usePWA()
  const [installing, setInstalling] = useState(false)

  if (isInstalled || !isInstallable) return null

  const handleInstall = async () => {
    setInstalling(true)
    await install()
    setInstalling(false)
  }

  return (
    <button onClick={handleInstall} disabled={installing} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: '#166534', border: '1px solid #22c55e',
      borderRadius: 10, padding: '10px 16px', cursor: 'pointer',
      color: '#22c55e', fontSize: 13, fontWeight: 600,
      fontFamily: 'inherit',
    }}>
      <span>📲</span>
      <span>{installing ? 'Instalando...' : 'Instalar app en el celular'}</span>
    </button>
  )
}
