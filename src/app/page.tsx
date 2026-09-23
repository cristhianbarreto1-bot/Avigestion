import { redirect } from 'next/navigation'

// El middleware redirige según el rol; esto es solo un respaldo
export default function Home() {
  redirect('/supervisor')
}
