import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import { SkillTreeView } from './SkillTreeView'

/**
 * Server component shell for /skill-tree.
 * Validates auth and delegates everything else to the client view.
 *
 * @returns The `SkillTreeView` client component after confirming the user is
 *   authenticated. Redirects to `/login` when no session is found.
 */
export default async function SkillTreePage() {
  const { userId } = await auth()
  if (!userId) redirect('/login')

  return <SkillTreeView />
}
