import type { User as PrismaUser, Category } from '@prisma/client'

import type { ConvertDateToString } from '@/types/utility'

declare module '@prisma/client' {
  interface User extends ConvertDateToString<PrismaUser> {}

  interface UserFieldRefs {
    readonly id: FieldRef<'User', 'Int'>
    readonly clerkId: FieldRef<'User', 'String'>
    readonly email: FieldRef<'User', 'String'>
    readonly name: FieldRef<'User', 'String'>
    readonly bio: FieldRef<'User', 'String'>
    readonly createdAt: FieldRef<'User', 'String'>
    readonly updatedAt: FieldRef<'User', 'String'>
  }
  export type $UserPayload<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    name: 'User'
    objects: {
      completed: Prisma.$CompletedPayload<ExtArgs>[]
      editor: Prisma.$EditorPayload<ExtArgs>[]
      category: Prisma.$CategoryPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<
      {
        id: number
        clerkId: string
        email: string | null
        name: string | null
        bio: string | null
        createdAt: string
        updatedAt: string
      },
      ExtArgs['result']['user']
    >
    composites: {}
  }
}
