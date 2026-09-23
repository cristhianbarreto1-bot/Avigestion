// ============================================================
// AVIGESTION - Middleware de Auth & Tenant
// Protege rutas, fuerza onboarding y redirige según rol
// ============================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rutas públicas (no requieren sesión)
const PUBLIC_PATHS = ['/login', '/register', '/auth/callback']
// Rutas públicas a las que no tiene sentido entrar logueado
const GUEST_ONLY = ['/login', '/register']

const ADMIN_PATHS = ['/settings/organization', '/settings/users', '/settings/billing']
const MANAGER_PATHS = ['/dashboard']  // owner, admin, veterinarian

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // ── 1. API: solo verificar sesión ───────────────────────────
  if (pathname.startsWith('/api/')) {
    if (!user && !pathname.startsWith('/api/webhooks')) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    return response
  }

  // ── 2. Rutas públicas ──────────────────────────────────────
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    if (user && GUEST_ONLY.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }

  // ── 3. Sin sesión → login ──────────────────────────────────
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── 4. Onboarding y permisos ───────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle()

  const hasOrg = !!profile?.organization_id
  const role = profile?.role ?? 'supervisor'

  if (!hasOrg) {
    return pathname === '/onboarding'
      ? response
      : NextResponse.redirect(new URL('/onboarding', request.url))
  }
  if (pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Inicio según rol
  if (pathname === '/') {
    const home = ['owner', 'admin', 'veterinarian'].includes(role) ? '/dashboard' : '/supervisor'
    return NextResponse.redirect(new URL(home, request.url))
  }

  if (ADMIN_PATHS.some(p => pathname.startsWith(p)) && !['owner', 'admin'].includes(role)) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  if (MANAGER_PATHS.some(p => pathname.startsWith(p)) &&
      !['owner', 'admin', 'veterinarian'].includes(role)) {
    return NextResponse.redirect(new URL('/supervisor', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Todo excepto estáticos, service worker, manifest e íconos
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
