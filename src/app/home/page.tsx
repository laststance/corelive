'use client'

import { useUser } from '@clerk/nextjs'
import {
  Search,
  Home as HomeIcon,
  Plus,
  Settings,
  ChevronDown,
  Edit,
  MoreHorizontal,
  FileText,
  Trash2,
  Download,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import { useIsElectron } from '@/components/auth/ElectronLoginForm'
import { ThemeSelectorMenuItem } from '@/components/ThemeSelectorMenuItem'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { isAppleSilicon } from '@/lib/utils'

import packageJson from '../../../package.json'

import './page.css'
import { Category } from './_components/Category'
import { CategoryManageDialog } from './_components/CategoryManageDialog'
import { LogoutButton } from './_components/LogoutButton'
import { TodoList } from './_components/TodoList'

/** GitHub repository info for download URLs */
const GITHUB_REPO = 'laststance/corelive'

export default function Home() {
  const { user } = useUser()
  const isElectron = useIsElectron()
  const router = useRouter()
  const [manageDialogOpen, setManageDialogOpen] = useState(false)

  /**
   * Generates the Mac app download URL based on detected architecture.
   * @returns
   * - ARM DMG URL for Apple Silicon Macs
   * - Intel DMG URL for Intel Macs
   */
  const macDownloadUrl = useMemo(() => {
    const version = packageJson.version
    const isArm = isAppleSilicon()
    const filename = isArm
      ? `CoreLive-${version}-arm64.dmg`
      : `CoreLive-${version}.dmg`

    return `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${filename}`
  }, [])

  /**
   * Opens the Settings page.
   * Navigates to the settings route using Next.js router.
   */
  const handleOpenSettings = useCallback(() => {
    router.push('/settings')
  }, [router])

  return (
    <SidebarProvider>
      <Sidebar className="border-r">
        <SidebarHeader className="px-4 pb-4">
          <div className="flex items-center justify-between">
            {/* User Profile Section */}
            <div className="flex flex-1 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="group h-auto flex-1 justify-start gap-2 p-2 hover:bg-sidebar-accent"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user?.imageUrl} alt="User" />
                      <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                        {user?.firstName?.charAt(0)?.toUpperCase() ||
                          user?.emailAddresses?.[0]?.emailAddress
                            ?.charAt(0)
                            ?.toUpperCase() ||
                          'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">
                        {user?.firstName ||
                          user?.emailAddresses?.[0]?.emailAddress ||
                          'User'}
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="start">
                  <div className="p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.imageUrl} alt="User" />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {user?.firstName?.charAt(0)?.toUpperCase() ||
                            user?.emailAddresses?.[0]?.emailAddress
                              ?.charAt(0)
                              ?.toUpperCase() ||
                            'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {user?.firstName ||
                            user?.emailAddresses?.[0]?.emailAddress ||
                            'User'}
                          's Todo
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Free Plan • 1 member
                        </div>
                      </div>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <span className="text-sm">
                      {user?.emailAddresses?.[0]?.emailAddress || 'No email'}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="text-sm">New workspace</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <ThemeSelectorMenuItem />
                  <LogoutButton />
                  {/* Show Mac app download only in web browser, not in Electron */}
                  {!isElectron && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <a
                          href={macDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          <span>Get Mac app</span>
                        </a>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2">
          {/* Search */}
          <div className="mb-2 px-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search"
                className="h-8 border-0 bg-sidebar-accent pl-8 focus-visible:ring-1"
              />
            </div>
          </div>

          {/* Main Navigation */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <HomeIcon className="h-4 w-4" />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <Category onOpenManage={() => setManageDialogOpen(true)} />

          <div className="flex-1" />

          {/* Bottom Navigation */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Settings button - only visible in Electron */}
                {isElectron && (
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleOpenSettings}>
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Trash2 className="h-4 w-4" />
                    <span>Trash</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t p-2">
          <div className="flex items-center justify-between px-2 pt-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Documents"
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Edit"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="window-drag-region flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="no-drag -ml-1" />
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">Tasks</h2>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">
          <TodoList />
        </div>
      </SidebarInset>
      <CategoryManageDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
      />
    </SidebarProvider>
  )
}
