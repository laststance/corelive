import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Unfarely',
  description: 'Unfarely convert your leafy tasks to solid experiences.',
}

export interface LayoutProps {
  children: Readonly<React.ReactNode>
}

const RootLayout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}

export default RootLayout
