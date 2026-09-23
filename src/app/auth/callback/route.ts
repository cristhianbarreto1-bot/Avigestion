// Confirmación de email: Supabase redirige acá con ?code=
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/utils/api'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=confirm`)
    }
  }
  return NextResponse.redirect(`${origin}/`)
}
