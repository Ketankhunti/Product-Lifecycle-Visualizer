import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Product Lifecycle Visualizer',
  description: 'Transform product descriptions into stunning sustainability storyboards with AI-powered image generation',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen hero-gradient">
          {children}
        </div>
      </body>
    </html>
  )
}
