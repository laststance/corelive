import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const endpoint = process.env.NEXT_PUBLIC_API_URL

export const RTKQuery = createApi({
  baseQuery: fetchBaseQuery({
    baseUrl: endpoint,
    fetchFn: async (requestInfo: RequestInfo, ...rest) =>
      fetch(requestInfo, ...rest),
    prepareHeaders: (headers: Headers) => {
      return headers
    },
  }),
  endpoints: (builder) => ({
    save: builder.mutation<TODO, TODO>({
      query: (values) => ({
        body: values,
        method: 'POST',
        url: 'save',
      }),
    }),
  }),
  keepUnusedDataFor: 180,
  reducerPath: 'RTK_Query',
  tagTypes: ['Posts'],
})

// Export hooks for usage in functional components, which are
// auto-generated based on the defined endpoints
export const { useSaveMutation } = RTKQuery
