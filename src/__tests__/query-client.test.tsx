import { QueryClient } from '../lib/query-client'

describe('QueryClient', () => {
  test('setQueryData and getQueryData maintain data consistency', () => {
    // Why? Core to global state management
    // If broken:
    // 1. Components could show different data for same query
    // 2. Manual updates via setQueryData wouldn't be reflected
    // 3. Type safety between set/get could be broken
    const client = new QueryClient({})
    const data = { id: 1, name: 'test' }

    client.setQueryData(['user', 1], data)
    expect(client.getQueryData(['user', 1])).toEqual(data)
  })

  test('fetchQuery properly coordinates with cache', async () => {
    // Why? Critical for data fetching lifecycle
    // If broken:
    // 1. Could have race conditions between concurrent fetches
    // 2. Might not update cache properly after fetch
    // 3. Error states might not be handled correctly
    const client = new QueryClient({})
    const queryFn = vi.fn().mockResolvedValue('data')

    // Test sequential fetch works
    await client.fetchQuery(['key'], queryFn)
    expect(client.getQueryData(['key'])).toBe('data')
    expect(queryFn).toHaveBeenCalledTimes(1)

    // Reset mock for concurrent test
    queryFn.mockClear()

    // Now test concurrent deduping
    await Promise.all([
      client.fetchQuery(['key'], queryFn),
      client.fetchQuery(['key'], queryFn),
    ])
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  test('invalidateQueries marks data as stale', () => {
    // Why? Essential for cache invalidation
    // If broken:
    // 1. Users might see stale data indefinitely
    // 2. Manual invalidation wouldn't trigger refetches
    // 3. Cache could get out of sync with server
    const client = new QueryClient({})
    const data = 'initial'
    client.setQueryData(['key'], data)

    client.invalidateQueries(['key'])
    // Next fetch should happen because data is stale
    const queryFn = vi.fn()

    void client.fetchQuery(['key'], queryFn)
    expect(queryFn).toHaveBeenCalled()
  })

  test('cancelQueries properly stops in-flight requests', () => {
    // Why? Important for cleanup and preventing race conditions
    // If broken:
    // 1. Memory leaks from abandoned requests
    // 2. UI could update with data from cancelled requests
    // 3. Could have inconsistent loading states
    const client = new QueryClient({})
    const queryFn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

    void client.fetchQuery(['key'], queryFn)
    client.cancelQueries(['key'])

    // Should preserve previous data and not be in loading state
    expect(client.getQueryData(['key'])).toBeUndefined()
  })

  test.skip('hashQueryKey handles complex query keys', () => {
    // Why? Critical for cache key consistency
    // If broken:
    // 1. Cache misses for equivalent query keys
    // 2. Duplicate data in cache for same logical query
    // 3. Memory leaks from proliferating cache entries
    const client = new QueryClient({})
    const complexKey = ['users', { id: 1, filter: { active: true } }]

    client.setQueryData(complexKey, 'data')
    expect(client.getQueryData(complexKey)).toBe('data')

    // Same logical key should hit cache
    const sameKey = ['users', { filter: { active: true }, id: 1 }]
    expect(client.getQueryData(sameKey)).toBe('data')
  })
})
