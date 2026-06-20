import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Médiathèques Strasbourg',
  description: 'Mes prêts et réservations',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta name="theme-color" content="#0D1B2A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
          }
        ` }} />
      </body>
    </html>
  )
}
