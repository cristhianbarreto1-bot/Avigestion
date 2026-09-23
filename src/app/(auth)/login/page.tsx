'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { ArrowRight, Egg, Mail, Lock } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const supabase = createClient()

  // Mensaje si viene de una confirmación de email fallida
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'confirm') {
      setError('El enlace de confirmación venció o ya se usó. Probá ingresar o registrate de nuevo.')
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos.'
          : error.message === 'Email not confirmed'
            ? 'Todavía no confirmaste tu email. Revisá tu bandeja de entrada.'
            : error.message
      )
      setLoading(false)
    } else {
      const redirect = new URLSearchParams(window.location.search).get('redirect')
      router.push(redirect && redirect.startsWith('/') ? redirect : '/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050907] text-[#f0fdf4] font-sans relative overflow-hidden">
      
      {/* Background Gradients & Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#22c55e] blur-[150px] opacity-20 animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-[#14b8a6] blur-[150px] opacity-20"></div>

      <div className="relative z-10 w-full max-w-lg p-10 bg-[#0a120c]/80 backdrop-blur-xl border border-[#1a3022]/50 rounded-3xl shadow-[0_0_50px_-12px_rgba(34,197,94,0.15)] transition-all">
        
        <div className="text-center mb-10 space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-tr from-[#166534] to-[#22c55e] shadow-lg shadow-[#22c55e]/30 mb-2">
            <Egg className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-[#a7f3d0]">
            AviGestión
          </h1>
          <p className="text-[#94a3b8] text-sm font-medium tracking-wide uppercase letter-spacing-2">
            Plataforma Profesional Avícola
          </p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="p-4 bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#fca5a5] rounded-xl text-sm text-center animate-in fade-in zoom-in duration-300">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#4b5563] group-focus-within:text-[#22c55e] transition-colors">
                <Mail className="h-5 w-5" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#070d0a] border border-[#1a3022] rounded-xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-[#22c55e]/50 focus:border-[#22c55e] text-white transition-all placeholder:text-[#334155]"
                placeholder="Ingresa tu correo"
              />
            </div>
            
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#4b5563] group-focus-within:text-[#22c55e] transition-colors">
                <Lock className="h-5 w-5" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#070d0a] border border-[#1a3022] rounded-xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-[#22c55e]/50 focus:border-[#22c55e] text-white transition-all placeholder:text-[#334155]"
                placeholder="••••••••"
              />
            </div>
          </div>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-[#050907] bg-gradient-to-r from-[#22c55e] to-[#10b981] hover:from-[#16a34a] hover:to-[#059669] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#22c55e] focus:ring-offset-[#070d0a] shadow-lg shadow-[#22c55e]/25 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#050907]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Procesando...
                </span>
              ) : (
                <span className="flex items-center text-[15px] tracking-wide">
                  Acceder a la plataforma
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </span>
              )}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-[#94a3b8]">
          ¿No tenés cuenta?{' '}
          <a href="/register" className="font-semibold text-[#22c55e] hover:underline">
            Crear cuenta gratis
          </a>
        </p>

      </div>
      
      {/* Decoration elements */}
      <div className="absolute bottom-5 text-center w-full text-xs text-[#334155] font-medium tracking-widest">
        © 2026 AVIGESTIÓN INC.
      </div>
    </div>
  )
}
