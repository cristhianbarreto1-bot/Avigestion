// ============================================================
// AVIGESTION - Root Layout (src/app/layout.tsx)
// PWA meta tags, SW registration, offline banner
// ============================================================

import type { Metadata, Viewport } from 'next'
import { OfflineBanner } from '@/lib/push/pwa'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default:  'AviGestión',
    template: '%s — AviGestión',
  },
  description: 'Gestión avícola profesional para supervisores y gerentes de granjas.',
  manifest:    '/manifest.json',
  appleWebApp: {
    capable:        true,
    statusBarStyle: 'black-translucent',
    title:          'AviGestión',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type:        'website',
    title:       'AviGestión',
    description: 'Gestión avícola profesional',
    siteName:    'AviGestión',
  },
  icons: {
    icon:   [
      { url: '/icons/icon-32.png',  sizes: '32x32',  type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple:  [{ url: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' }],
    other:  [{ rel: 'mask-icon', url: '/icons/safari-pinned-tab.svg', color: '#22c55e' }],
  },
}

export const viewport: Viewport = {
  width:             'device-width',
  initialScale:      1,
  maximumScale:      1,    // deshabilitar zoom en móvil (UX de app nativa)
  userScalable:      false,
  viewportFit:       'cover',
  themeColor:        '#070d0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" style={{ colorScheme: 'dark' }}>
      <head>
        {/* iOS PWA específico */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

        {/* Prevenir llamadas automáticas en números */}
        <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#070d0a' }}>

        {/* Registro del Service Worker */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(reg) {
                      console.log('[AviGestión] SW registrado:', reg.scope);
                    })
                    .catch(function(err) {
                      console.warn('[AviGestión] SW error:', err);
                    });
                });
              }
            `,
          }}
        />

        {children}

        {/* Banner offline — visible en toda la app */}
        <OfflineBanner />
      </body>
    </html>
  )
}
