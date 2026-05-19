'use client'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/dashboard', icon: '📊', label: 'Panel principal' },
  { href: '/gerencial', icon: '🖥️', label: 'Panel gerencial', highlight: true },
  { href: '/granja', icon: '🏡', label: 'Mi granja' },
  { href: '/lotes', icon: '🐣', label: 'Lotes' },
  { href: '/inspecciones', icon: '📋', label: 'Inspecciones' },
  { href: '/alertas', icon: '🔔', label: 'Alertas' },
  { href: '/reportes', icon: '📈', label: 'Reportes' },
  { href: '/calculadoras', icon: '🧮', label: 'Calculadoras' },
  { href: '/instructivos', icon: '📖', label: 'Instructivos' },
]

export default function Sidebar({ granjaNombre, userEmail }: { granjaNombre?: string, userEmail?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-52 bg-white border-r border-gray-200 flex flex-col min-h-screen sticky top-0 h-screen overflow-y-auto shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 font-semibold text-gray-900">
          <div className="w-7 h-7 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center text-sm">🐔</div>
          AviGestión
        </div>
        {granjaNombre && <p className="text-xs text-gray-400 mt-1 pl-9 truncate">{granjaNombre}</p>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <a key={item.href} href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-sm transition-all cursor-pointer ${
                active ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </a>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 p-3">
        <p className="text-xs text-gray-400 truncate mb-2">{userEmail}</p>
        <button onClick={logout} className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 transition-colors w-full">
          <span>🚪</span> Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
