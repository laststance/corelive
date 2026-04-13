import { AppSidebar } from '@/components/AppSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

/**
 * Shared layout for all routes under the `(main)` Route Group.
 * Wraps children with the SidebarProvider and renders the AppSidebar.
 * Route Group parentheses mean this layout applies to `/home` and `/skill-tree`
 * without adding segments to the URL.
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
