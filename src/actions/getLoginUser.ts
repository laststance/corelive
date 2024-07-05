'use server'

import { auth } from '@clerk/nextjs/server'

import { prisma } from '@/lib/prisma'
import type { User } from '@/types/app'

export async function getLoginUser(): Promise<User | null> {
  try {
    const { userId: clerkId } = auth()
    const user = await prisma.user.findFirst({
      where: { clerkId: clerkId as string },
    })
    return user as unknown as User
  } catch (error) {
    console.error(error)
    return null
  }
}
