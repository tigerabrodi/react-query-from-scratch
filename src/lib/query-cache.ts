import { DEFAULT_GC_TIME, DEFAULT_STALE_TIME } from './constants'
import { getDifferenceInMs } from './date-utils'
import { QueryState } from './types'

type CacheEntry<T> = {
  state: QueryState<T>
  queryFn: () => Promise<T>
}

type QueryCacheConfig = {
  gcTime?: number
  defaultStaleTime?: number
}

export class QueryCache {
  private cache: Map<string, CacheEntry<unknown>>
  private promisesInFlight: Map<string, Promise<unknown>>
  private subscribers: Map<string, Set<() => void>>
  // This is actually really important
  // Each queryKey has its own timeout
  // Initially, I started with a single timeout for all queryKeys
  // I feel dumb in retrospect 😂, but I guess you learn as you build
  // It's so obvious now lol
  private gcTimeouts: Map<string, number> = new Map()
  private gcQueue: Set<string>
  private gcTime: number
  private defaultStaleTime: number

  constructor(config: QueryCacheConfig) {
    this.cache = new Map()
    this.promisesInFlight = new Map()
    this.subscribers = new Map()
    this.gcQueue = new Set()

    this.gcTime = config.gcTime ?? DEFAULT_GC_TIME
    this.defaultStaleTime = config.defaultStaleTime ?? DEFAULT_STALE_TIME
  }

  subscribe(queryKey: string, callback: () => void) {
    const subscribers = this.subscribers.get(queryKey) || new Set()
    subscribers.add(callback)
    this.subscribers.set(queryKey, subscribers)
  }

  unsubscribe(queryKey: string, callback: () => void) {
    const subscribers = this.subscribers.get(queryKey)
    if (subscribers) {
      subscribers.delete(callback)

      // If there are no subscribers, remove the queryKey from the subscribers map
      if (this.getSubscriberCount({ queryKey }) === 0) {
        this.subscribers.delete(queryKey)
        this.gcQueue.add(queryKey)
        this.scheduleGC({ queryKey })
      }
    }
  }

  get({ queryKey }: { queryKey: string }) {
    const entry = this.cache.get(queryKey)
    // If we don't have a cache entry, return undefined
    // There is nothing!
    if (!entry) return undefined

    const differenceInMs = getDifferenceInMs({
      startTime: entry.state.lastUpdated,
      endTime: Date.now(),
    })
    const isStale = differenceInMs > this.defaultStaleTime
    if (isStale) {
      // Fire background fetch
      void this.fetchQuery({
        queryKey,
        queryFn: entry.queryFn,
      })
    }

    return entry.state
  }

  // Whenever we need to update the cache, we need to notify subscribers
  // Why?
  // Because we need to update the UI (re-render)
  set({
    queryKey,
    state,
    queryFn,
  }: {
    queryKey: string
    state: QueryState<unknown>
    queryFn: () => Promise<unknown>
  }) {
    this.cache.set(queryKey, { state, queryFn })
    this.notifySubscribers(queryKey)
  }

  private notifySubscribers(queryKey: string) {
    const subscribers = this.subscribers.get(queryKey)
    if (subscribers) {
      subscribers.forEach((callback) => callback())
    }
  }

  async fetchQuery<T>({
    queryKey,
    queryFn,
  }: {
    queryKey: string
    queryFn: () => Promise<T>
  }) {
    // If there's an in-flight promise, return it
    // No need to trigger a new request
    const existing = this.promisesInFlight.get(queryKey)
    if (existing) return existing

    // Useful information to understand promises ⬇️
    // When you call a promise, it will be executed immediately
    // It goes into the web api environment and then the microtask queue
    // Every Promise method e.g. Promise.all, is used to "observe" and wait for the promise to resolve
    const promise = queryFn()
    this.promisesInFlight.set(queryKey, promise)

    try {
      // More information about promises ⬇️
      // When we call "await promise"
      // All we're saying is "wait for the promise to resolve"
      // The promise has already been fired
      // Calling queryFn() again would fire off a new promise (request)
      // When you call `await queryFn()`, what actually happens is that the promise is returned from `queryFn()`
      // ...and that is what `await` is waiting for to be resolved
      const data = await promise
      return data
    } finally {
      // Clean up after completion/error
      this.promisesInFlight.delete(queryKey)
    }
  }

  cancelQuery({ queryKey }: { queryKey: string }): void {
    this.promisesInFlight.delete(queryKey)
    // TODO: in the future, see if we can cancel the actual promise
    // Maybe somehow use Promise.race along with AbortController?
    // There is no built in way to cancel a promise in JS e.g. Promise.cancel() 😟
    // In proposal stage: https://github.com/tc39/proposal-cancellation
  }

  private getSubscriberCount({ queryKey }: { queryKey: string }) {
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
