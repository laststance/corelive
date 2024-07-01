import { expectType } from 'ts-expect'

import type { ConvertDateToString } from '@/types/utility'

type User = {
  id: number
  name: string
  createdAt: Date
  updatedAt: Date
}

type UserWithDateStrings = ConvertDateToString<User>

expectType<UserWithDateStrings>({
  id: 1,
  name: 'Gen',
  updatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
})

expectType<UserWithDateStrings>({
  id: 1,
  name: 'Gen',
  // @ts-expect-error Type Date is not assignable to type string
  updatedAt: new Date(),
  createdAt: new Date().toISOString(),
})
