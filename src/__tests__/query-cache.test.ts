import { CacheEntry, QueryCache } from '../lib/query-cache'

describe('QueryCache core functionality', () => {
  test('subscriber management correctly tracks counts', () => {
    // Why? Critical for GC timing. If we mess this up:
    // 1. Memory leaks if we don't clean up
    // 2. Data gets cleaned too early if count is wrong
    const cache = new QueryCache({})
    const callback = () => {}

    cache.subscribe('key', callback)
    expect(cache.getSubscriberCount({ queryKey: 'key' })).toBe(1)

    cache.unsubscribe('key', callback)
    expect(cache.getSubscriberCount({ queryKey: 'key' })).toBe(0)
  })

  test('stale check triggers background fetch', () => {
    // Why? Core to stale-while-revalidate pattern
    // If broken: Users see stale data longer than configured
    const cache = new QueryCache()
    const queryFn = vi.fn()

    cache.set({
      queryKey: 'key',
      state: {
        lastUpdatedAt: Date.now() - 1000,
        status: 'success',
        data: 'data',
        error: null,
      },
      queryFn,
    })

    cache.get({ queryKey: 'key' })
    expect(queryFn).toHaveBeenCalled()
  })

  test('fetchQuery deduplicates concurrent requests', async () => {
    const cache = new QueryCache({})
    const queryFn = vi.fn().mockResolvedValue('data')

    await Promise.all([
      cache.fetchQuery({ queryKey: 'key', queryFn }),
      cache.fetchQuery({ queryKey: 'key', queryFn }),
    ])

    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  test('markAsStale triggers new fetch on next get', async () => {
    const cache = new QueryCache()
    const queryFn = vi.fn().mockResolvedValue('new data')

    // Setup initial data
    await cache.fetchQuery({ queryKey: 'key', queryFn })
    queryFn.mockClear()

    // Mark as stale
    cache.markAsStale({ queryKey: 'key' })

    // Just marking stale doesn't trigger fetch
    expect(queryFn).not.toHaveBeenCalled()

    // Get should trigger the background fetch
    cache.get({ queryKey: 'key' })
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  test('fetchQuery initializes with initialData', async () => {
    const cache = new QueryCache()
    const queryFn = vi.fn().mockResolvedValue('data')

    await cache.fetchQuery({
      queryKey: 'key',
      queryFn,
      initialData: 'initial data',
    })
    expect(queryFn).not.toHaveBeenCalled()

    expect(cache.get({ queryKey: 'key' })).toMatchObject({
      queryFn,
      state: {
        status: 'success',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        lastUpdatedAt: expect.any(Number),
        data: 'initial data',
        error: null,
      },
    } satisfies CacheEntry<string>)
  })
})

describe('Direct vs Background Query Flow', () => {
  test('direct query follows idle -> loading -> success flow', async () => {
    // Why? Fundamental to initial data loading experience
    // If broken:
    // 1. Users might not see loading states
    // 2. Components might render incorrectly
    // 3. Race conditions between states
    const cache = new QueryCache()
    const queryFn = vi.fn().mockResolvedValue('data')
    const states: Array<string> = []

    cache.subscribe('key', () => {
      const state = cache.get({ queryKey: 'key' })?.state
      if (state) {
        states.push(state.status)
      }
    })

    await cache.fetchQuery({ queryKey: 'key', queryFn })
    // Order here is important
    // We start with loading and move to success
    // Otherwise test would fail, which is good 😁
    expect(states).toEqual(['loading', 'success'])
  })

  test('background query follows success -> fetching -> success flow', async () => {
    // Why? Critical for stale-while-revalidate UX
    // If broken:
    // 1. Users might see loading spinner instead of stale data
    // 2. Unnecessary UI flicker during background updates
    const cache = new QueryCache()
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce('initial')
      .mockResolvedValueOnce('updated')

    await cache.fetchQuery({ queryKey: 'key', queryFn })
    expect(cache.get({ queryKey: 'key' })?.state.data).toBe('initial')

    type QueryState = {
      status: 'success' | 'fetching' | 'loading' | 'idle' | 'error'
      data: string | undefined
    }

    const states: Array<QueryState> = []

    cache.subscribe('key', () => {
      const entry = cache.get<string>({ queryKey: 'key' })
      if (entry) {
        states.push({
          status: entry.state.status,
          data: entry.state.data,
        })
      }
    })

    await cache.backgroundQuery({ queryKey: 'key', queryFn })
    expect(states).toEqual([
      { status: 'fetching', data: 'initial' },
      { status: 'success', data: 'updated' },
    ])
  })

  test('background query keeps old data during fetch', async () => {
    // Why? Essential for showing stale data while fetching
    // If broken:
    // 1. UI would show loading state instead of stale data
    // 2. Poor user experience with content flicker
    const cache = new QueryCache()
    const queryFn = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve('new data'), 50))
      )

    await cache.fetchQuery({
      queryKey: 'key',
      queryFn: () => Promise.resolve('old data'),
    })

    void cache.backgroundQuery({ queryKey: 'key', queryFn })
    const entry = cache.get({ queryKey: 'key' })

    expect(entry?.state).toMatchObject({
      status: 'fetching',
      data: 'old data',
    })
  })

  test('background query silently recovers from errors', async () => {
    // Why? Background errors shouldn't disrupt current view
    // If broken:
    // 1. Users would see error states for background refreshes
    // 2. Good data might be replaced with error states
    const cache = new QueryCache()
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce('good data')
      .mockRejectedValueOnce(new Error('failed refresh'))

    await cache.fetchQuery({ queryKey: 'key', queryFn })
    const beforeError = cache.get({ queryKey: 'key' })?.state

    await cache.backgroundQuery({ queryKey: 'key', queryFn })
    const afterError = cache.get({ queryKey: 'key' })?.state

    expect(beforeError?.data).toBe('good data')
    expect(afterError?.data).toBe('good data')
    expect(afterError?.status).toBe('success')
  })

  test('direct query properly handles errors', async () => {
    // Why? Users need to know when initial loads fail
    // If broken:
    // 1. Failed loads might appear successful
    // 2. Error states might not propagate to UI
    const cache = new QueryCache()
    const queryFn = vi.fn().mockRejectedValue(new Error('load failed'))

    await cache.fetchQuery({ queryKey: 'key', queryFn })
    const entry = cache.get({ queryKey: 'key' })

    expect(entry?.state).toMatchObject({
      status: 'error',
      data: undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      error: expect.any(Error),
    })
  })
})
