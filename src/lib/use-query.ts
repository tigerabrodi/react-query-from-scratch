import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from './context'
import { hashKey } from './hash-utils'
import { QueryState, UseQueryOptions, UseQueryResult } from './query-types'

export function useQuery<TData>(
  options: UseQueryOptions<TData>
): UseQueryResult<TData> {
  const queryClient = useQueryClient()
  const isInitialFetchRef = useRef(true)
  const { queryKey, queryFn, isEnabled = true } = options

  // We should not create a new object on every render when the query is disabled (isEnabled = false)
  // Object should be the same reference across renders
  const initialStateRef = useRef<QueryState<TData>>({
    status: 'idle',
    data: undefined,
    error: null,
    lastUpdatedAt: Date.now(),
  })

  const getSnapshot: () => QueryState<TData> = useCallback(() => {
    return queryClient.getQueryState<TData>(queryKey) ?? initialStateRef.current
  }, [queryClient, queryKey])

  const state = useSyncExternalStore(
    useCallback(
      (onStoreChange) => {
        const hashedKey = hashKey(queryKey)
        return queryClient.subscribe(hashedKey, onStoreChange)
      },
      [queryClient, queryKey]
    ),
    getSnapshot
  )

  useEffect(() => {
    if (isEnabled && queryFn && isInitialFetchRef.current) {
      // queryClient.fetchQuery() is a function that fetches the data
      // Inside query cache we determine whether direct or background fetch
      void queryClient.fetchQuery({
        queryKey,
        queryFn,
        initialData: options.initialData,
      })

      isInitialFetchRef.current = false
    }
  }, [isEnabled, queryClient, queryFn, queryKey, options.initialData])

  // If user explicitly calls refetch, then it's ok to refetch
  const refetch = useCallback(() => {
    if (!queryFn) return
    void queryClient.refetchQueries(queryKey)
  }, [queryClient, queryFn, queryKey])

  // To help TypeScript understand the shape of the result
  switch (state.status) {
    case 'idle':
      return {
        status: 'idle',
        data: undefined,
        error: null,
        isLoading: false,
        isError: false,
        isSuccess: false,
        refetch,
      }
    case 'loading':
      return {
        status: 'loading',
        data: undefined,
        error: null,
        isLoading: true,
        isError: false,
        isSuccess: false,
        refetch,
      }
    case 'fetching':
      return {
        status: 'fetching',
        data: state.data,
        error: null,
        isLoading: false,
        isError: false,
        isSuccess: false,
        refetch,
      }
    case 'error':
      return {
        status: 'error',
        data: undefined,
        error: state.error,
        isLoading: false,
        isError: true,
        isSuccess: false,
        refetch,
      }
    case 'success':
    case 'first-success':
      return {
        status: 'success',
        data: state.data,
        error: null,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch,
      }
  }
}
