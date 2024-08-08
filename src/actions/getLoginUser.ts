'use server'

import { auth } from '@clerk/nextjs/server'

import { prisma } from '@/lib/prisma'
import type { User } from '@/types/prisma'

export async function getLoginUser(): Promise<User> {
  const { userId: clerkId } = auth()
  const user = await prisma.user.findFirst({
    where: { clerkId: clerkId as string },
  })
  return user as unknown as User
}
