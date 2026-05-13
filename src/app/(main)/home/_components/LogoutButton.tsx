'use client'

import { useClerk } from '@clerk/nextjs'
import { LogOut } from 'lucide-react'
import { memo, useCallback } from 'react'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { log } from '@/lib/logger'

export const LogoutButton = memo(function LogoutButton() {
  const { signOut } = useClerk()

  const handleLogout = useCallback(async () => {
    try {
      await signOut()
    } catch (error) {
      log.error('Logout failed:', error)
    }
  }, [signOut])

  return (
    <DropdownMenuItem
      onClick={handleLogout}
      className="cursor-pointer text-destructive focus:text-destructive"
    >
      <LogOut className="mr-2 h-4 w-4" />
      <span>Log out</span>
    </DropdownMenuItem>
  )
})
