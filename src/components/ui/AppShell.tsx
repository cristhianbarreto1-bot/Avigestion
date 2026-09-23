'use client'

// Encabezado y contenedor comunes de la app (tema oscuro/verde)
import { usePathname, useRouter } from 'next/navigation'
import { Egg, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

const NAV = [
  { href: '/dashboard',       label: 'Panel',        managerOnly: true },
  { href: '/supervisor',      label: 'Inspeccionar' },
  { href: '/flocks/new',      label: 'Nuevo lote' },
  { href: '/supervisor/thermal', label: 'Confort térmico' },
]

export function AppShell({
  children,
  showManagerNav = true,
}: {
  children: React.ReactNode
  showManagerNav?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#070d0a] text-[#f0fdf4]">
      <header className="sticky top-0 z-20 border-b border-[#1a3022] bg-[#0d1810]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <a href="/" className="flex items-center gap-2 font-extrabold text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-[#166534] to-[#22c55e]">
              <Egg className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">AviGestión</span>
            <span className="rounded bg-[#22c55e]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#22c55e]">
              Beta
            </span>
          </a>
          <nav className="ml-2 flex flex-1 gap-1 overflow-x-auto text-sm">
            {NAV.filter(n => showManagerNav || !n.managerOnly).map(n => {
              const active = pathname === n.href
              return (
                <a
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${
                    active ? 'bg-[#166534]/40 text-[#22c55e]' : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  {n.label}
                </a>
              )
            })}
          </nav>
          <button
            onClick={logout}
            title="Salir"
            className="rounded-lg p-2 text-[#94a3b8] hover:bg-[#111f16] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}

export const inputClass =
  'w-full rounded-xl border border-[#1a3022] bg-[#070d0a] px-4 py-3 text-white placeholder:text-[#334155] focus:border-[#22c55e] focus:outline-none focus:ring-2 focus:ring-[#22c55e]/40'

export const buttonClass =
  'w-full rounded-xl bg-gradient-to-r from-[#22c55e] to-[#10b981] px-4 py-3 font-bold text-[#050907] shadow-lg shadow-[#22c55e]/20 transition hover:from-[#16a34a] hover:to-[#059669] disabled:opacity-50'

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[#cbd5e1]">{label}</span>
      {children}
      {hint && <span className="block text-xs text-[#4b5563]">{hint}</span>}
    </label>
  )
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 p-3 text-sm text-[#fca5a5]">
      {message}
    </div>
  )
}
