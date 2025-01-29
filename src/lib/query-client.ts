import { hashKey } from './hash-utils'
import { QueryCache } from './query-cache'
import { QueryState } from './query-types'

type QueryClientConfig = {
  staleTime?: number
  gcTime?: number
}

export class QueryClient {
  private queryCache: QueryCache

  constructor(config?: QueryClientConfig) {
    this.queryCache = new QueryCache(config)
  }

  async fetchQuery<TData>({
    queryKey,
    queryFn,
    initialData,
  }: {
    queryKey: ReadonlyArray<unknown>
    queryFn: () => Promise<TData>
    initialData?: TData
  }) {
    const hashedKey = hashKey(queryKey)
    return this.queryCache.fetchQuery({
      queryKey: hashedKey,
      queryFn,
      initialData,
    })
  }

  // Default to unknown in case user doesn't specify a type
  getQueryData<TData = unknown>(
    queryKey: ReadonlyArray<unknown>
  ): TData | undefined {
    const existingCachedEntry = this.queryCache.getCacheEntry<TData>({
      queryKey: hashKey(queryKey),
    })

    return existingCachedEntry?.state.data
  }

  setQueryData<TData>(queryKey: ReadonlyArray<unknown>, data: TData): void {
    const hashedKey = hashKey(queryKey)
    this.queryCache.setData({ queryKey: hashedKey, data })
  }

  refetchQueries(queryKey: ReadonlyArray<unknown>): Promise<void> {
    const hashedKey = hashKey(queryKey)
    return this.queryCache.refetchQuery({ queryKey: hashedKey })
  }

  invalidateQueries(queryKey: ReadonlyArray<unknown>): void {
    const hashedKey = hashKey(queryKey)

    // Should have the fire and forget experience
    void this.queryCache.invalidateQuery({ queryKey: hashedKey })
  }

  cancelQueries(queryKey: ReadonlyArray<unknown>): void {
    const hashedKey = hashKey(queryKey)
    this.queryCache.cancelQuery({ queryKey: hashedKey })
  }

  getQueryState<TData>(
    queryKey: ReadonlyArray<unknown>
  ): QueryState<TData> | undefined {
    const hashedKey = hashKey(queryKey)
    const entry = this.queryCache.getCacheEntry<TData>({ queryKey: hashedKey })

    return entry?.state
  }

  hasQuery(queryKey: ReadonlyArray<unknown>): boolean {
    const hashedKey = hashKey(queryKey)
    return this.queryCache.hasQuery({ queryKey: hashedKey })
  }

  subscribe(queryKey: string, callback: () => void) {
    return this.queryCache.subscribe(queryKey, callback)
  }

  clear(): void {
    this.queryCache.clear()
  }
}
