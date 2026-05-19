import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: granja } = await supabase
    .from('granjas').select('nombre,plan').eq('owner_id', user.id).single()

  return (
    <div className="flex min-h-screen bg-[#f5f5f0]">
      <Sidebar granjaNombre={granja?.nombre} userEmail={user.email} />
      <main className="flex-1 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  )
}
