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
    const hashedKey = this.hashQueryKey(queryKey)
    return this.queryCache.fetchQuery({ queryKey: hashedKey, queryFn })
  }

  // Default to unknown in case user doesn't specify a type
  getQueryData<TData = unknown>(
    queryKey: ReadonlyArray<unknown>
  ): TData | undefined {
    const existingCachedEntry = this.queryCache.get<TData>({
      queryKey: this.hashQueryKey(queryKey),
    })

    return existingCachedEntry?.state.data
  }

  setQueryData<TData>(queryKey: ReadonlyArray<unknown>, data: TData): void {
    const hashedKey = this.hashQueryKey(queryKey)
    this.queryCache.setData({ queryKey: hashedKey, data })
  }

  invalidateQueries(queryKey: ReadonlyArray<unknown>): void {
    const hashedKey = this.hashQueryKey(queryKey)
    this.queryCache.markAsStale({ queryKey: hashedKey })
  }

  cancelQueries(queryKey: ReadonlyArray<unknown>): void {
    const hashedKey = this.hashQueryKey(queryKey)
    this.queryCache.cancelQuery({ queryKey: hashedKey })
  }

  hasQuery(queryKey: ReadonlyArray<unknown>): boolean {
    const hashedKey = this.hashQueryKey(queryKey)
    return this.queryCache.hasQuery({ queryKey: hashedKey })
  }

  clear(): void {
    this.queryCache.clear()
  }

  private hashQueryKey(queryKey: ReadonlyArray<unknown>): string {
    return JSON.stringify(queryKey)
  }
}
