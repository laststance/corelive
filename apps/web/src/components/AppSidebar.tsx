'use client'

import { useUser } from '@clerk/nextjs'
import {
  BookOpen,
  ChevronDown,
  Download,
  LayoutDashboard,
  Settings,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { Category } from '@/app/(main)/home/_components/Category'
import { CategoryManageDialog } from '@/app/(main)/home/_components/CategoryManageDialog'
import { LogoutButton } from '@/app/(main)/home/_components/LogoutButton'
import { useIsElectron } from '@/components/auth/ElectronLoginForm'
import { ThemeSelectorMenuItem } from '@/components/ThemeSelectorMenuItem'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { MAC_DOWNLOAD_URL } from '@/lib/constants/macDownload'

/**
 * Displays the Journal menu item during prerender and after its URL is available.
 * @example <JournalMenuLink onClick={closeMobileSidebar} />
 */
function JournalMenuLink({
  href = '/home#journal',
  onClick,
}: {
  href?: string
  onClick: () => void
}) {
  return (
    <SidebarMenuButton asChild>
      <Link href={href} onClick={onClick}>
        <BookOpen className="size-4" />
        <span>Journal</span>
      </Link>
    </SidebarMenuButton>
  )
}

/**
 * Preserves journal filters from the current Dashboard URL once the router is ready.
 * @example <FilteredJournalMenuLink onClick={closeMobileSidebar} />
 */
function FilteredJournalMenuLink({ onClick }: { onClick: () => void }) {
  const searchParams = useSearchParams()
  const journalParams = new URLSearchParams()
  // Opening the journal closes day detail while retaining its search and category.
  for (const key of ['search', 'category', 'filter']) {
    const value = searchParams.get(key)
    if (value !== null) journalParams.set(key, value)
  }
  const query = journalParams.toString()
  return (
    <JournalMenuLink
      href={query ? `/home?${query}#journal` : undefined}
      onClick={onClick}
    />
  )
}

/**
 * Provides account actions, navigation and category management for Dashboard.
 * The shared signed-in layout renders it beside the current page.
 * @example <AppSidebar />
 */
export const AppSidebar = function AppSidebar() {
  const { user } = useUser()
  const isElectron = useIsElectron()
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const [manageDialogOpen, setManageDialogOpen] = useState(false)
  const email = user?.emailAddresses?.[0]?.emailAddress
  const displayName = user?.firstName || email || 'Account'

  const closeMobileSidebar = (): void => {
    setOpenMobile(false)
  }
  const handleOpenCategoryManager = (): void => {
    setManageDialogOpen(true)
  }

  return (
    <>
      <Sidebar className="border-r">
        <SidebarHeader className="px-4 pb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto w-full justify-start gap-2 p-2 hover:bg-sidebar-accent"
              >
                <Avatar aria-hidden="true" className="size-6">
                  <AvatarImage src={user?.imageUrl} alt="" />
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-left text-sm font-medium">
                  {displayName}
                </span>
                <ChevronDown className="size-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="start">
              {email && (
                <>
                  <DropdownMenuLabel className="break-all">
                    {email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}
              <ThemeSelectorMenuItem />
              <LogoutButton />
              {!isElectron && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a
                      href={MAC_DOWNLOAD_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="size-4" />
                      Get CoreLive for Mac
                    </a>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarHeader>

        <SidebarContent className="px-2">
          <SidebarGroup>
            <SidebarGroupContent>
              <nav aria-label="Dashboard">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/home'}>
                      <Link
                        href="/home"
                        aria-current={pathname === '/home' ? 'page' : undefined}
                        onClick={closeMobileSidebar}
                      >
                        <LayoutDashboard className="size-4" />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <Suspense
                      fallback={
                        <JournalMenuLink onClick={closeMobileSidebar} />
                      }
                    >
                      {pathname === '/home' ? (
                        <FilteredJournalMenuLink onClick={closeMobileSidebar} />
                      ) : (
                        <JournalMenuLink onClick={closeMobileSidebar} />
                      )}
                    </Suspense>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === '/skill-tree'}
                    >
                      <Link
                        href="/skill-tree"
                        aria-current={
                          pathname === '/skill-tree' ? 'page' : undefined
                        }
                        onClick={closeMobileSidebar}
                      >
                        <Sparkles className="size-4" />
                        <span>Skill Tree</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />
          <Category onOpenManageAction={handleOpenCategoryManager} />
        </SidebarContent>

        <SidebarFooter className="border-t px-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/settings" onClick={closeMobileSidebar}>
                  <Settings className="size-4" />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <CategoryManageDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
      />
    </>
  )
}
