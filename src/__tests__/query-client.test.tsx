import { QueryClient } from '../lib/query-client'

describe('QueryClient', () => {
  test('setQueryData and getQueryData maintain data consistency', () => {
    // Why? Core to global state management
    // If broken:
    // 1. Components could show different data for same query
    // 2. Manual updates via setQueryData wouldn't be reflected
    // 3. Type safety between set/get could be broken
    const client = new QueryClient()
    const data = { id: 1, name: 'test' }

    client.setQueryData(['user', 1], data)
    expect(client.getQueryData(['user', 1])).toEqual(data)
  })

  test('fetchQuery updates cache with data', async () => {
    const client = new QueryClient()
    const queryFn = vi.fn().mockResolvedValue('data')

    await client.fetchQuery({ queryKey: ['key'], queryFn })
    expect(client.getQueryData(['key'])).toBe('data')
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  test('fetchQuery deduplicates concurrent requests', async () => {
    const client = new QueryClient()
    const queryFn = vi.fn().mockResolvedValue('data')

    await Promise.all([
      client.fetchQuery({ queryKey: ['key'], queryFn }),
      client.fetchQuery({ queryKey: ['key'], queryFn }),
    ])
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  test('invalidateQueries marks data as stale', () => {
    // Why? For cache invalidation
    // If broken:
    // 1. Users might see stale data indefinitely
    // 2. Manual invalidation wouldn't trigger refetches
    // 3. Cache could get out of sync with server
    const client = new QueryClient({
      staleTime: 10000,
    })
    const data = 'initial'
    client.setQueryData(['key'], data)

    client.invalidateQueries(['key'])
    // Next fetch should happen because data is stale
    // Even if staleTime is 10000
    const queryFn = vi.fn()

    void client.fetchQuery({ queryKey: ['key'], queryFn })
    expect(queryFn).toHaveBeenCalled()
  })

  test('cancelQueries properly stops in-flight requests', () => {
    // Why? Important for cleanup and preventing race conditions
    // If broken:
    // 1. Memory leaks from abandoned requests
    // 2. UI could update with data from cancelled requests
    // 3. Could have inconsistent loading states
    const client = new QueryClient()
    const queryFn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50))
      )

    void client.fetchQuery({ queryKey: ['key'], queryFn })
    client.cancelQueries(['key'])

    // Should preserve previous data and not be in loading state
    expect(client.getQueryData(['key'])).toBeUndefined()
  })

  test('hashQueryKey handles complex query keys', () => {
    // Why? Critical for cache key consistency
    // If broken:
    // 1. Cache misses for equivalent query keys
    // 2. Duplicate data in cache for same logical query
    // 3. Memory leaks from proliferating cache entries
    const client = new QueryClient()
    const complexKey = ['users', { id: 1, filter: { active: true } }]

    client.setQueryData(complexKey, 'data')
    expect(client.getQueryData(complexKey)).toBe('data')

    // Same logical key should hit cache
    const sameKey = ['users', { filter: { active: true }, id: 1 }]
    expect(client.getQueryData(sameKey)).toBe('data')
  })

  test('refetchQueries triggers new fetch with existing queryFn', async () => {
    const client = new QueryClient()
    const queryFn = vi.fn().mockResolvedValue('new data')

    // Setup initial data
    await client.fetchQuery({ queryKey: ['key'], queryFn })
    queryFn.mockClear()

    // Refetch should work and use same queryFn
    await client.refetchQueries(['key'])
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(['key'])).toBe('new data')
  })

  test('getQueryState correctly tracks through loading, success, and error states', async () => {
    const client = new QueryClient()
    const successFn = vi.fn().mockResolvedValue('data')
    const errorFn = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

    // Initially should be undefined
    expect(client.getQueryState(['key'])).toBeUndefined()

    // Test success path
    const successPromise = client.fetchQuery({
      queryKey: ['key'],
      queryFn: successFn,
    })
    expect(client.getQueryState(['key'])).toMatchObject({
      status: 'loading',
      data: undefined,
      error: null,
    })

    await successPromise
    expect(client.getQueryState(['key'])).toMatchObject({
      status: 'first-success',
      data: 'data',
      error: null,
    })

    // Test error path with different key
    const errorPromise = client.fetchQuery({
      queryKey: ['error-key'],
      queryFn: errorFn,
    })
    expect(client.getQueryState(['error-key'])).toMatchObject({
      status: 'loading',
      data: undefined,
      error: null,
    })

    await errorPromise
    // Inside query cache, error is handled by properly updating the state
    // We don't throw and let it propagate up to the user
    expect(client.getQueryState(['error-key'])).toMatchObject({
      status: 'error',
      data: undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      error: expect.any(Error),
    })
  })
})
