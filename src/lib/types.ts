type BaseQueryState = {
  lastUpdated: number
}

type IdleQueryState = BaseQueryState & {
  status: 'idle'
  data: undefined
  error: null
}

type LoadingQueryState = BaseQueryState & {
  status: 'loading'
  data: undefined
  error: null
  isLoading: true
}

type ErrorQueryState = BaseQueryState & {
  status: 'error'
  data: undefined
  error: Error
  isLoading: false
}

type SuccessQueryState<TData> = BaseQueryState & {
  status: 'success'
  data: TData
  error: null
  isLoading: false
}

export type QueryState<TData> =
  | IdleQueryState
  | LoadingQueryState
  | ErrorQueryState
  | SuccessQueryState<TData>

export type UseQueryOptions<TData> = {
  queryKey: ReadonlyArray<unknown>
  queryFn: () => Promise<TData>
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
