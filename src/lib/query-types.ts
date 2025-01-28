type BaseQueryState = {
  lastUpdatedAt: number
}

type IdleQueryState<TData> = BaseQueryState & {
  status: 'idle'
  // Can be undefined or previous data
  data: TData | undefined
  error: null
}

type LoadingQueryState = BaseQueryState & {
  status: 'loading'
  data: undefined
  error: null
}

type ErrorQueryState = BaseQueryState & {
  status: 'error'
  data: undefined
  error: Error
}

type SuccessQueryState<TData> = BaseQueryState & {
  status: 'success'
  data: TData
  error: null
}

export type QueryState<TData> =
  | IdleQueryState<TData>
  | LoadingQueryState
  | ErrorQueryState
  | SuccessQueryState<TData>

// In real tanstack query: https://github.com/TanStack/query/blob/main/packages/query-core/src/types.ts#L45
// They use a Register interface that they extend
// This is a TypeScript trick for extensibility
// it's a form of "type registration" that allows users to override these types globally.
// e.g.
// declare module '@tanstack/query-core' {
//   interface Register {
//     defaultError: CustomError
//     queryKey: [string, number]
//   }
// }
// We don't need this! 😅
export type QueryKey = ReadonlyArray<unknown>

export type UseQueryOptions<TData> = {
  queryKey: QueryKey
  queryFn?: () => Promise<TData>
  isEnabled?: boolean
  staleTime?: number
  gcTime?: number
  initialData?: TData
}

export type UseQueryResult<TData> =
  | {
      status: 'idle'
      data: undefined
      error: null
      isLoading: false
      isError: false
      isSuccess: false
      refetch: () => Promise<TData>
    }
  | {
      status: 'loading'
      data: undefined
      error: null
      isLoading: true
      isError: false
      isSuccess: false
      refetch: () => Promise<TData>
    }
  | {
      status: 'error'
      data: undefined
      error: Error
      isLoading: false
      isError: true
      isSuccess: false
      refetch: () => Promise<TData>
    }
  | {
      status: 'success'
      data: TData
      error: null
      isLoading: false
      isError: false
      isSuccess: true
      refetch: () => Promise<TData>
    }
