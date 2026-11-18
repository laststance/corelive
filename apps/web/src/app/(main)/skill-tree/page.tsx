import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { SkillTreeView } from './SkillTreeView'

export const metadata: Metadata = { title: 'Skill Tree' }

/**
 * Server component shell for /skill-tree.
 * Validates auth and delegates everything else to the client view.
 *
 * @returns The `SkillTreeView` client component after confirming the user is
 *   authenticated. Redirects to `/login` when no session is found.
 */
async function SkillTreePage() {
  const { userId } = await auth()
  if (!userId) redirect('/login')

  return <SkillTreeView />
}

export default SkillTreePage
