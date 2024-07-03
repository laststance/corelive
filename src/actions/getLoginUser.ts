'use server'

import { auth } from '@clerk/nextjs/server'
import type { User } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export async function getLoginUser(): Promise<User | null> {
  try {
    const { userId: clerkId } = auth()
    const user = await prisma.user.findFirst({
      where: { clerkId: clerkId as string },
    })
    return user
  } catch (error) {
    console.error(error)
    return null
  }
}
