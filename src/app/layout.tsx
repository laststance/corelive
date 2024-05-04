import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Corelive',
  description: 'Corelive convert your leafy tasks to solid experiences.',
}

export interface LayoutProps {
  children: Readonly<React.ReactNode>
}

const RootLayout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}

export default RootLayout
