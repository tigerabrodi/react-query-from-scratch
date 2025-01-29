import {
  DEFAULT_GC_TIME,
  DEFAULT_STALE_TIME,
  FIRST_FETCH_SUCCESS_BACKGROUND_FETCH_BUFFER_WINDOW_MS,
  FORCE_STALE_TIME,
} from './constants'
import { QueryState } from './query-types'
import { getDifferenceInMs, handlePromise } from './utils'

export type CacheEntry<T> = {
  state: QueryState<T>
  queryFn?: () => Promise<T>
}

type QueryCacheConfig = {
  gcTime?: number
  staleTime?: number
}

export class QueryCache {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cache: Map<string, CacheEntry<any>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private promisesInFlight: Map<string, Promise<any>>
  private subscribers: Map<string, Set<() => void>>
  // This is actually really important
  // Each queryKey has its own timeout
  // Initially, I started with a single timeout for all queryKeys
  // I feel dumb in retrospect 😂, but I guess you learn as you build
  // It's so obvious now lol
  private gcTimeouts: Map<string, number> = new Map()
  private gcQueue: Set<string>
  private gcTime: number
  private staleTime: number

  constructor(config?: QueryCacheConfig) {
    this.cache = new Map()
    this.promisesInFlight = new Map()
    this.subscribers = new Map()
    this.gcQueue = new Set()

    this.gcTime = config?.gcTime ?? DEFAULT_GC_TIME
    this.staleTime = config?.staleTime ?? DEFAULT_STALE_TIME
  }

  // A subscriber is a single component
  // Multiple components can subscribe to the same query
  // Imagine multiple components using useQuery with the same queryKey
  subscribe(queryKey: string, callback: () => void) {
    const subscribers = this.subscribers.get(queryKey) || new Set()
    subscribers.add(callback)
    this.subscribers.set(queryKey, subscribers)

    return () => this.unsubscribe(queryKey, callback)
  }

  unsubscribe(queryKey: string, callback: () => void) {
    const subscribers = this.subscribers.get(queryKey)
    if (subscribers) {
      // The reason this works is because callback is a reference to the same function
      subscribers.delete(callback)

      // If there are no subscribers, remove the queryKey from the subscribers map
      if (this.getSubscriberCount({ queryKey }) === 0) {
        this.subscribers.delete(queryKey)
        this.gcQueue.add(queryKey)
        this.scheduleGC({ queryKey })
      }
    }
  }

  /**
   * getState's job is to get the state of a query without any side effects
   * It's primarily used in tests to check the state of a query
   */
  getState<TData>({
    queryKey,
  }: {
    queryKey: string
  }): QueryState<TData> | undefined {
    const entry = this.cache.get(queryKey) as CacheEntry<TData> | undefined
    return entry?.state
  }

  getCacheEntry<TData>({
    queryKey,
  }: {
    queryKey: string
  }): CacheEntry<TData> | undefined {
    return this.cache.get(queryKey) as CacheEntry<TData> | undefined
  }

  clear() {
    this.cache.clear()
    this.promisesInFlight.clear()
    this.subscribers.clear()
    this.gcTimeouts.clear()
    this.gcQueue.clear()
  }

  hasQuery({ queryKey }: { queryKey: string }): boolean {
    return this.cache.has(queryKey)
  }

  /**
   * setData's job is to set data and notify subscribers
   */
  setData<TData>({ queryKey, data }: { queryKey: string; data: TData }) {
    const entry = this.cache.get(queryKey) as CacheEntry<TData> | undefined

    this.setAndNotifySubscribers({
      queryKey,
      state: {
        status: 'success',
        data,
        error: null,
        lastUpdatedAt: Date.now(),
      },
      queryFn: entry?.queryFn,
    })
  }

  set<TData>({
    queryKey,
    state,
    queryFn,
  }: {
    queryKey: string
    state: QueryState<TData>
    queryFn?: () => Promise<TData>
  }) {
    this.cache.set(queryKey, { state, queryFn })
  }

  /**
   * notifySubscribers' job is to notify subscribers
   * Calling a subscriber is what causes the component to re-render
   * This is private to the QueryCache class
   */
  private notifySubscribers(queryKey: string) {
    const subscribers = this.subscribers.get(queryKey)
    if (subscribers) {
      subscribers.forEach((callback) => callback())
    }
  }

  /**
   * setAndNotifySubscribers' job is to set the state and notify subscribers
   * This is private to the QueryCache class
   */
  private setAndNotifySubscribers<TData>({
    queryKey,
    state,
    queryFn,
  }: {
    queryKey: string
    state: QueryState<TData>
    queryFn?: () => Promise<TData>
  }) {
    this.set({ queryKey, state, queryFn })
    this.notifySubscribers(queryKey)
  }

  /**
   * refetchQuery's job is to directly trigger fetch
   * It's used when user explicitly calls refetch
   */
  refetchQuery<TData>({ queryKey }: { queryKey: string }): Promise<void> {
    const entry = this.cache.get(queryKey) as CacheEntry<TData>
    if (!entry?.queryFn) {
      throw new Error(`No queryFn found for queryKey: ${queryKey}`)
    }

    // Directly trigger fetch
    return this.directQuery({ queryKey, queryFn: entry.queryFn })
  }

  /**
   * fetchQuery's job is to decide whether to use direct or background fetch
   */
  async fetchQuery<TData>({
    queryKey,
    queryFn,
    initialData,
  }: {
    queryKey: string
    queryFn: () => Promise<TData>
    initialData?: TData
  }): Promise<void> {
    const entry = this.cache.get(queryKey) as CacheEntry<TData> | undefined

    if (!entry) {
      // If the entry doesn't exist, we need to initialize it
      // This is the first time the query is being fetched
      await this.directQuery({ queryKey, queryFn, initialData })
    } else {
      // If the entry exists, users get it in their snapshot right away from the cache
      // We want to fire off a background fetch to revalidate the data
      // Inside of backgroundQuery, we do all the necessary checks to determine if we should fetch or not
      await this.backgroundQuery({ queryKey, queryFn })
    }
  }

  /**
   * backgroundQuery's job is to fire a background fetch
   * It's used when the query is in the success state
   * We want to revalidate the data
   * There is quite some logic here, so read code and comments carefully
   */
  private async backgroundQuery<TData>({
    queryKey,
    queryFn,
  }: {
    queryKey: string
    queryFn: () => Promise<TData>
  }): Promise<void> {
    // If there's an in-flight promise, return it
    // No need to trigger a new request
    const promiseInFlight = this.promisesInFlight.get(queryKey) as
      | Promise<TData>
      | undefined

    const entry = this.cache.get(queryKey) as CacheEntry<TData> | undefined

    // When to early return?
    // 1. There's an in-flight promise
    // 2. The entry is already fetching
    // 3. The entry is undefined (entry must exist for background fetch to work)
    // 4. Entry is NOT in any success states, background fetch can only happen after success
    // 5. Entry is not stale based on staleTime

    if (promiseInFlight || !entry) {
      return
    }

    const isNotInAnySuccessStates =
      entry.state.status !== 'success' && entry.state.status !== 'first-success'
    const isFetching = entry.state.status === 'fetching'
    if (isNotInAnySuccessStates || isFetching) return

    const differenceInMs = getDifferenceInMs({
      startTime: entry.state.lastUpdatedAt,
      endTime: Date.now(),
    })

    const isStale = differenceInMs > this.staleTime

    // Only refetch if the data is stale
    if (!isStale) {
      return
    }

    const isFirstFetchSuccessForQuery = entry.state.status === 'first-success'
    const isFirstFetchWithinBufferWindow =
      differenceInMs < FIRST_FETCH_SUCCESS_BACKGROUND_FETCH_BUFFER_WINDOW_MS
    if (isFirstFetchSuccessForQuery && isFirstFetchWithinBufferWindow) {
      return
    }

    // Used for rollback if something goes wrong
    const prevLastUpdatedAt = entry.state.lastUpdatedAt

    // We want the UI to reflect the fetching state
    // e.g. if user wants to show some spinner to right
    // letting their users know that something is happening
    this.setAndNotifySubscribers({
      queryKey,
      state: {
        status: 'fetching',
        // important: keep the data from the previous fetch
        data: entry.state.data,
        error: null,
        lastUpdatedAt: Date.now(),
      },
    })

    // Useful information to understand promises ⬇️
    // When you call a promise, it will be executed immediately
    // It goes into the web api environment and then the microtask queue when it's done
    // Every Promise method e.g. Promise.all, is used to "observe" and wait for the promise to resolve
    const promise = queryFn()
    this.promisesInFlight.set(queryKey, promise)

    // More information about promises ⬇️
    // When we call "await promise"
    // All we're saying is "wait for the promise to resolve"
    // The promise has already been fired
    // Calling queryFn() again would fire off a new promise (request)
    // When you call `await queryFn()`, what actually happens is that the promise is returned from `queryFn()`
    // ...and that is what `await` is waiting for to be resolved
    const [data, error] = await handlePromise({
      promise,
      finallyCb: () => {
        // Clean up after completion/error
        this.promisesInFlight.delete(queryKey)
      },
    })

    // If there's an error, we want to fallback to the previous data
    // No need to notify subscribers since we're not changing the data
    if (error) {
      this.setAndNotifySubscribers({
        queryKey,
        state: {
          status: 'success',
          error: null,
          data: entry.state.data,
          lastUpdatedAt: prevLastUpdatedAt,
        },
        queryFn,
      })
    } else {
      this.setAndNotifySubscribers({
        queryKey,
        state: {
          status: 'success',
          data,
          error: null,
          lastUpdatedAt: Date.now(),
        },
        queryFn,
      })
    }
  }

  /**
   * directQuery's job is to directly trigger fetch
   * We only hindren them if we need to do request deduplication
   */
  async directQuery<TData>({
    queryKey,
    queryFn,
    initialData,
  }: {
    queryKey: string
    queryFn: () => Promise<TData>
    initialData?: TData
  }): Promise<void> {
    // If there's an in-flight promise, return it
    // No need to trigger a new request
    const promiseInFlight = this.promisesInFlight.get(queryKey) as
      | Promise<TData>
      | undefined

    const entry = this.cache.get(queryKey) as CacheEntry<TData> | undefined

    // Early return if:
    // 1. There's an in-flight promise
    // 2. The entry is already loading
    // Both should be there at the same time
    // For safety, we check both
    if (promiseInFlight || entry?.state.status === 'loading') return

    const shouldInitializeWithInitialData =
      !promiseInFlight &&
      initialData !== undefined &&
      entry?.state.data === undefined

    if (shouldInitializeWithInitialData) {
      // Initializing and notifying subscribers here is fine since it's the first time
      this.setAndNotifySubscribers({
        queryKey,
        state: {
          status: 'first-success',
          data: initialData,
          error: null,
          lastUpdatedAt: Date.now(),
        },
        queryFn,
      })
      return
    }

    // We want the UI to reflect the loading state
    this.setAndNotifySubscribers({
      queryKey,
      state: {
        status: 'loading',
        data: undefined,
        error: null,
        lastUpdatedAt: Date.now(),
      },
    })

    // Useful information to understand promises ⬇️
    // When you call a promise, it will be executed immediately
    // It goes into the web api environment and then the microtask queue when it's done
    // Every Promise method e.g. Promise.all, is used to "observe" and wait for the promise to resolve
    const promise = queryFn()
    this.promisesInFlight.set(queryKey, promise)

    // More information about promises ⬇️
    // When we call "await promise"
    // All we're saying is "wait for the promise to resolve"
    // The promise has already been fired
    // Calling queryFn() again would fire off a new promise (request)
    // When you call `await queryFn()`, what actually happens is that the promise is returned from `queryFn()`
    // ...and that is what `await` is waiting for to be resolved
    const [data, error] = await handlePromise({
      promise,
      finallyCb: () => {
        // Clean up after completion/error
        this.promisesInFlight.delete(queryKey)
      },
    })

    if (error) {
      this.setAndNotifySubscribers({
        queryKey,
        state: {
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
          data: undefined,
          lastUpdatedAt: FORCE_STALE_TIME,
        },
        queryFn,
      })
    } else {
      // If we don't have data
      // It means it's the first fetch for the query
      const isFirstFetchForQuery = !entry?.state.data

      this.setAndNotifySubscribers({
        queryKey,
        state: {
          status: isFirstFetchForQuery ? 'first-success' : 'success',
          data,
          error: null,
          lastUpdatedAt: Date.now(),
        },
        queryFn,
      })
    }
  }

  cancelQuery<TData>({ queryKey }: { queryKey: string }): void {
    // TODO: in the future, see if we can cancel the actual promise
    // Maybe somehow use Promise.race along with AbortController?
    // There is no built in way to cancel a promise in JS e.g. Promise.cancel() 😟
    // In proposal stage: https://github.com/tc39/proposal-cancellation

    const hasExistingPromise = Boolean(this.promisesInFlight.get(queryKey))
    const entry = this.cache.get(queryKey) as CacheEntry<TData> | undefined
    if (hasExistingPromise && entry) {
      this.promisesInFlight.delete(queryKey)
      this.setAndNotifySubscribers({
        queryKey,
        state: {
          ...entry.state,
          status: 'idle',
          error: null,
          lastUpdatedAt: FORCE_STALE_TIME,
        },
        queryFn: entry.queryFn,
      })
    }
  }

  async invalidateQuery<TData>({
    queryKey,
  }: {
    queryKey: string
  }): Promise<void> {
    const entry = this.cache.get(queryKey) as CacheEntry<TData> | undefined
    if (entry) {
      // Mark as stale
      this.setAndNotifySubscribers({
        queryKey,
        state: {
          status: 'success',
          data: entry.state.data,
          error: null,
          lastUpdatedAt: FORCE_STALE_TIME,
        },
        queryFn: entry.queryFn,
      })

      if (entry.queryFn) {
        await this.backgroundQuery({
          queryKey,
          queryFn: entry.queryFn,
        })
      }
    }
  }

  getSubscriberCount({ queryKey }: { queryKey: string }) {
    return this.subscribers.get(queryKey)?.size || 0
  }

  /**
   * scheduleGC's job is to schedule garbage collection
   * It's used to clean up the cache
   * This is private to the QueryCache class
   */
  private scheduleGC({ queryKey }: { queryKey: string }) {
    const existingTimeout = this.gcTimeouts.get(queryKey)
    if (existingTimeout) clearTimeout(existingTimeout)

    const timeout = setTimeout(() => {
      this.cache.delete(queryKey)
      this.promisesInFlight.delete(queryKey)
      this.subscribers.delete(queryKey)
      this.gcTimeouts.delete(queryKey)
    }, this.gcTime)

    this.gcTimeouts.set(queryKey, timeout)
  }
}
