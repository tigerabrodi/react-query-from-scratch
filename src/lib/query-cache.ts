import {
  DEFAULT_GC_TIME,
  DEFAULT_STALE_TIME,
  FORCE_STALE_TIME,
} from './constants'
import { QueryState } from './query-types'
import { getDifferenceInMs, handlePromise } from './utils'

type CacheEntry<T> = {
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

  get<TData>({
    queryKey,
  }: {
    queryKey: string
  }): CacheEntry<TData> | undefined {
    const entry = this.cache.get(queryKey) as CacheEntry<TData> | undefined
    // If we don't have a cache entry, return undefined
    // There is nothing!
    if (!entry) return undefined

    const differenceInMs = getDifferenceInMs({
      startTime: entry.state.lastUpdatedAt,
      endTime: Date.now(),
    })

    const isStale = differenceInMs > this.staleTime

    if (isStale && entry.queryFn) {
      // Fire background fetch
      void this.fetchQuery({
        queryKey,
        queryFn: entry.queryFn,
      })
    }

    return entry
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

  setData<TData>({ queryKey, data }: { queryKey: string; data: TData }) {
    const entry = this.get<TData>({ queryKey })

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

  // Every time the UI should reflect the updated state
  // We need to notify subscribers
  // Calling a subscriber is what causes the component to re-render
  private notifySubscribers(queryKey: string) {
    const subscribers = this.subscribers.get(queryKey)
    if (subscribers) {
      subscribers.forEach((callback) => callback())
    }
  }

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

  refetchQuery<TData>({ queryKey }: { queryKey: string }): Promise<TData> {
    const entry = this.cache.get(queryKey) as CacheEntry<TData>
    if (!entry?.queryFn) {
      throw new Error(`No queryFn found for queryKey: ${queryKey}`)
    }

    // Directly trigger fetch
    return this.fetchQuery({ queryKey, queryFn: entry.queryFn })
  }

  async fetchQuery<TData>({
    queryKey,
    queryFn,
  }: {
    queryKey: string
    queryFn: () => Promise<TData>
  }): Promise<TData> {
    // If there's an in-flight promise, return it
    // No need to trigger a new request
    const existing = this.promisesInFlight.get(queryKey) as
      | Promise<TData>
      | undefined
    if (existing) return existing

    this.setAndNotifySubscribers({
      queryKey,
      state: {
        status: 'loading',
        data: undefined,
        error: null,
        lastUpdatedAt: FORCE_STALE_TIME,
      },
    })

    // Useful information to understand promises ⬇️
    // When you call a promise, it will be executed immediately
    // It goes into the web api environment and then the microtask queue when it's done
    // Every Promise method e.g. Promise.all, is used to "observe" and wait for the promise to resolve
    const promise = queryFn()
    this.promisesInFlight.set(queryKey, promise)

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

      throw error
    }

    // More information about promises ⬇️
    // When we call "await promise"
    // All we're saying is "wait for the promise to resolve"
    // The promise has already been fired
    // Calling queryFn() again would fire off a new promise (request)
    // When you call `await queryFn()`, what actually happens is that the promise is returned from `queryFn()`
    // ...and that is what `await` is waiting for to be resolved
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

    return data
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

  markAsStale({ queryKey }: { queryKey: string }) {
    const entry = this.cache.get(queryKey)
    if (entry) {
      this.setAndNotifySubscribers({
        queryKey,
        state: {
          ...entry.state,
          lastUpdatedAt: FORCE_STALE_TIME,
        },
        queryFn: entry.queryFn,
      })
    }
  }

  getSubscriberCount({ queryKey }: { queryKey: string }) {
    return this.subscribers.get(queryKey)?.size || 0
  }

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
