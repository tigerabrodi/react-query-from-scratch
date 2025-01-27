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

export type UseQueryOptions<TData> = {
  queryKey: ReadonlyArray<unknown>
  queryFn?: () => Promise<TData>
  staleTime?: number
  gcTime?: number
}

export type UseQueryResult<TData> =
  | {
      status: 'loading'
      data: undefined
      error: null
      isLoading: true
      isError: false
      isSuccess: false
    }
  | {
      status: 'error'
      data: undefined
      error: Error
      isLoading: false
      isError: true
      isSuccess: false
    }
  | {
      status: 'success'
      data: TData
      error: null
      isLoading: false
      isError: false
      isSuccess: true
    }
