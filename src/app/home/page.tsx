'use client'

import { useUser } from '@clerk/nextjs'
import {
  Search,
  Home as HomeIcon,
  Inbox,
  Plus,
  Settings,
  Users,
  ChevronDown,
  Edit,
  MoreHorizontal,
  FileText,
  Star,
  Trash2,
} from 'lucide-react'

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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'

import './page.css'
import { TodoList } from './_components/TodoList'
import { UserMenu } from './_components/UserMenu'

export default function Home() {
  const { user } = useUser()

  return (
    <SidebarProvider>
      <Sidebar className="border-r">
        <SidebarHeader className="p-4">
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
                    <div className="mb-3 flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1">
                        <Settings className="mr-1 h-3 w-3" />
                        Settings
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1">
                        <Users className="mr-1 h-3 w-3" />
                        Invite members
                      </Button>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <span className="text-sm">
                      {user?.emailAddresses?.[0]?.emailAddress || 'No email'}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={user?.imageUrl} alt="User" />
                        <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                          {user?.firstName?.charAt(0)?.toUpperCase() ||
                            user?.emailAddresses?.[0]?.emailAddress
                              ?.charAt(0)
                              ?.toUpperCase() ||
                            'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">
                        {user?.firstName ||
                          user?.emailAddresses?.[0]?.emailAddress ||
                          'User'}
                        's Todo
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="text-sm">New workspace</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Create work account</DropdownMenuItem>
                  <DropdownMenuItem>Add another account</DropdownMenuItem>
                  <UserMenu />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Get Mac app</DropdownMenuItem>
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
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Inbox className="h-4 w-4" />
                    <span>Inbox</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          {/* Shared Section */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Shared
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Plus className="h-4 w-4" />
                    <span>Start collaborating</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Private Section */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Private
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <div className="flex h-4 w-4 items-center justify-center rounded bg-purple-500">
                      <Star className="h-2.5 w-2.5 text-white" />
                    </div>
                    <span>React Web Dev Wiki</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <FileText className="h-4 w-4" />
                    <span>Web dev Wiki Sub</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Plus className="h-4 w-4" />
                    <span>Add new</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <div className="flex-1" />

          {/* Bottom Navigation */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <FileText className="h-4 w-4" />
                    <span>Marketplace</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Users className="h-4 w-4" />
                <span>Invite members</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex items-center justify-between px-2 pt-2">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <FileText className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6">
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
    </SidebarProvider>
  )
}
