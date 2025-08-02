import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { Toaster } from "@/components/ui/toaster"

export const metadata: Metadata = {
  title: 'RECHARTED.IO | YOU ARE RECHARTED',
  description: 'The ultimate tool for roasting crypto influencers. Drop their tweets on token charts and watch their predictions age like milk. Perfect for exposing bad takes and celebrating rare wins. Dont get caught being recharted.',
  keywords: 'crypto, twitter, influencers, roast, bad takes, token charts, crypto memes, trading fails, prediction fails',
  authors: [{ name: 'RECHARTED.IO' }],
  creator: 'RECHARTED.IO',
  publisher: 'RECHARTED.IO',
  generator: 'v0.dev',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'RECHARTED.IO - Expose Crypto Influencer Takes',
    description: 'The ultimate tool for roasting crypto influencers. Drop their tweets on token charts and expose their terrible predictions.',
    url: 'https://recharted.io',
    siteName: 'RECHARTED.IO',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RECHARTED.IO - Expose Crypto Influencer Takes',
    description: 'The ultimate tool for roasting crypto influencers. Drop their tweets on token charts and expose their terrible predictions.',
    creator: '@recharted_io',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "RECHARTED.IO",
              "description": "The ultimate tool for roasting crypto influencers. Drop their tweets on token charts and expose their terrible predictions.",
              "url": "https://recharted.io",
              "applicationCategory": "FinanceApplication",
              "operatingSystem": "Web Browser",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "creator": {
                "@type": "Organization",
                "name": "RECHARTED.IO"
              }
            })
          }}
        />
        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
