import { QueryCache } from '../lib/query-cache'

describe('QueryCache', () => {
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
        lastUpdated: Date.now() - 1000,
        status: 'success',
        data: 'data',
        error: null,
        isLoading: false,
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
})
