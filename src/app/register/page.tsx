import { auth, clerkClient } from '@clerk/nextjs/server'
import { PrismaClient } from '@prisma/client'
import { redirect } from 'next/navigation'

const prisma = new PrismaClient()
/**
 * Store the Clerk user in the database
 */
async function Page() {
  const { userId } = auth().protect()

  const { id, username } = await clerkClient.users.getUser(userId)

  try {
    await prisma.user.create({
      data: {
        clerkId: id,
        name: username,
      },
    })
    redirect('/dashboard')
  } catch (error) {
    // TODO show error message on toast
    redirect('/')
  }
}

export default Page
