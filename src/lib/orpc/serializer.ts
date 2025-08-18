import { StandardRPCJsonSerializer } from '@orpc/client/standard'

export const serializer = new StandardRPCJsonSerializer({
  customJsonSerializers: [
    // Date type serializer
    {
      type: 21, // Use values greater than 20 for custom types
      condition: (data: any) => data instanceof Date,
      serialize: (data: Date) => data.toISOString(),
      deserialize: (data: string) => new Date(data),
    },
  ],
})
