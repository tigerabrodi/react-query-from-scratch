import { hashKey } from './hash-utils'
import { QueryCache } from './query-cache'

type QueryClientConfig = {
  staleTime?: number
  gcTime?: number
}

export class QueryClient {
  private queryCache: QueryCache

  constructor(config: QueryClientConfig) {
    this.queryCache = new QueryCache(config)
  }

  async fetchQuery<TData>(
    queryKey: ReadonlyArray<unknown>,
    queryFn: () => Promise<TData>
  ) {
    const hashedKey = hashKey(queryKey)
    return this.queryCache.fetchQuery({ queryKey: hashedKey, queryFn })
  }

  // Default to unknown in case user doesn't specify a type
  getQueryData<TData = unknown>(
    queryKey: ReadonlyArray<unknown>
  ): TData | undefined {
    const existingCachedEntry = this.queryCache.get<TData>({
      queryKey: hashKey(queryKey),
    })

    return existingCachedEntry?.state.data
  }

  setQueryData<TData>(queryKey: ReadonlyArray<unknown>, data: TData): void {
    const hashedKey = hashKey(queryKey)
    this.queryCache.setData({ queryKey: hashedKey, data })
  }

  refetchQueries<TData>(queryKey: ReadonlyArray<unknown>): Promise<TData> {
    const hashedKey = hashKey(queryKey)
    return this.queryCache.refetchQuery({ queryKey: hashedKey })
  }

  invalidateQueries(queryKey: ReadonlyArray<unknown>): void {
    const hashedKey = hashKey(queryKey)
    this.queryCache.markAsStale({ queryKey: hashedKey })
  }

  cancelQueries(queryKey: ReadonlyArray<unknown>): void {
    const hashedKey = hashKey(queryKey)
    this.queryCache.cancelQuery({ queryKey: hashedKey })
  }

  hasQuery(queryKey: ReadonlyArray<unknown>): boolean {
    const hashedKey = hashKey(queryKey)
    return this.queryCache.hasQuery({ queryKey: hashedKey })
  }

  clear(): void {
    this.queryCache.clear()
  }
}
