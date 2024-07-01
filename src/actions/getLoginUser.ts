'use server'

import { auth } from '@clerk/nextjs/server'

import { prisma } from '@/lib/prisma'

export async function getLoginUser() {
  try {
    const { userId: clerkId } = auth()
    const user = await prisma.user.findFirst({
      omit: { createdAt: true, updatedAt: true },
      where: { clerkId: clerkId as string },
    })
    return user
  } catch (error) {
    console.error(error)
    return null
  }
}
