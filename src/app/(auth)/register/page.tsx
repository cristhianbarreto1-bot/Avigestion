'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Egg, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import { Field, ErrorBox, inputClass, buttonClass } from '@/components/ui/AppShell'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError('La contraseña necesita al menos 8 caracteres, con mayúsculas, minúsculas y números.')
      return
    }
    setLoading(true)
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)
    if (error) {
      setError(error.message.includes('registered') ? 'Ese email ya tiene una cuenta. Ingresá desde el login.' : error.message)
      return
    }
    // Si Supabase exige confirmar el email, no hay sesión todavía
    if (!data.session) {
      setCheckEmail(true)
      return
    }
    router.push('/onboarding')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050907] p-4 text-[#f0fdf4]">
      <div className="w-full max-w-md rounded-3xl border border-[#1a3022]/60 bg-[#0a120c] p-8">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-[#166534] to-[#22c55e]">
            <Egg className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold">Crear cuenta</h1>
          <p className="mt-1 text-sm text-[#94a3b8]">30 días de prueba, sin tarjeta</p>
        </div>

        {checkEmail ? (
          <div className="space-y-4 text-center">
            <MailCheck className="mx-auto h-10 w-10 text-[#22c55e]" />
            <p className="text-[#cbd5e1]">
              Te enviamos un email a <strong className="text-white">{email}</strong>.
              Abrí el enlace para confirmar tu cuenta y seguir con la configuración.
            </p>
            <a href="/login" className="inline-block text-sm font-semibold text-[#22c55e] hover:underline">
              Ir al login
            </a>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <ErrorBox message={error} />
            <Field label="Nombre y apellido">
              <input className={inputClass} value={fullName} onChange={e => setFullName(e.target.value)} required minLength={2} />
            </Field>
            <Field label="Email">
              <input type="email" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} required />
            </Field>
            <Field label="Contraseña" hint="Mínimo 8 caracteres, con mayúsculas, minúsculas y números">
              <input type="password" className={inputClass} value={password} onChange={e => setPassword(e.target.value)} required />
            </Field>
            <button type="submit" disabled={loading} className={buttonClass}>
              {loading ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
            <p className="text-center text-sm text-[#94a3b8]">
              ¿Ya tenés cuenta?{' '}
              <a href="/login" className="font-semibold text-[#22c55e] hover:underline">Ingresar</a>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
