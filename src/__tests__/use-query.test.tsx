// use-query.test.tsx
import { act, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { QueryClientProvider } from '../lib/context'
import { QueryClient } from '../lib/query-client'
import { useQuery } from '../lib/use-query'

function UserProfile({ userId }: { userId: number }) {
  const { data, isLoading, error } = useQuery<{ id: number; name: string }>({
    queryKey: ['user', userId],
    queryFn: () =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ id: userId, name: 'John Doe' }), 50)
      ),
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div role="alert">Error: {error.message}</div>
  if (!data) return null

  return <div>{data.name}&apos;s Profile</div>
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient()
  const result = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  )
  return {
    ...result,
    queryClient: client,
  }
}

describe('useQuery in components', () => {
  test('shows loading state and then data', async () => {
    renderWithClient(<UserProfile userId={1} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(await screen.findByText("John Doe's Profile")).toBeInTheDocument()
  })

  test('shows error state when fetch fails', async () => {
    const UserWithError = () => {
      const { error } = useQuery({
        queryKey: ['user', 'error'],
        queryFn: () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Failed to fetch')), 50)
          ),
      })

      if (error) return <div role="alert">{error.message}</div>
      return null
    }

    renderWithClient(<UserWithError />)

    await screen.findByRole('alert')
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument()
  })

  test('respects isEnabled option', async () => {
    const queryFn = vi.fn()
    function DisabledQuery() {
      useQuery({
        queryKey: ['test'],
        queryFn,
        isEnabled: false,
      })
      return null
    }

    renderWithClient(<DisabledQuery />)

    // Wait a bit to ensure query doesn't fire
    await new Promise((r) => setTimeout(r, 50))
    expect(queryFn).not.toHaveBeenCalled()
  })

  test('initializes with initialData without fetching', () => {
    // Remove async
    const queryFn = vi.fn()

    function InitialDataQuery() {
      const { data } = useQuery({
        queryKey: ['initialData-test'], // Unique key to avoid cache conflicts
        queryFn,
        initialData: { id: 1, message: 'initial' },
      })
      return <div data-testid="result">{data?.message}</div>
    }

    // Regular render is fine here since we're not doing async work
    const { getByTestId } = renderWithClient(<InitialDataQuery />)

    // Check sync render result
    expect(getByTestId('result')).toHaveTextContent('initial')
    expect(queryFn).not.toHaveBeenCalled()
  })

  test('preserves current data during background updates', async () => {
    const values = ['first', 'updated']
    let callCount = 0
    const queryFn = vi
      .fn()
      .mockImplementation(() => Promise.resolve(values[callCount++]))

    function BackgroundQuery() {
      const { data, isLoading } = useQuery<string>({
        queryKey: ['background'],
        queryFn,
      })

      if (isLoading) return <div>loading</div>
      return <div>{data}</div>
    }

    const { queryClient } = renderWithClient(<BackgroundQuery />)

    // Initial load
    await screen.findByText('first')

    // Force a background update
    act(() => {
      queryClient.invalidateQueries(['background'])
    })

    // Should still show old data
    expect(screen.getByText('first')).toBeInTheDocument()

    // Eventually shows new data
    await screen.findByText('updated')
  })

  test('respects first-success state before background updates', async () => {
    const queryFn = vi.fn().mockResolvedValue('data')

    function Query() {
      const { data } = useQuery<string>({
        queryKey: ['test'],
        queryFn,
      })
      return <div>{data}</div>
    }

    renderWithClient(<Query />)
    await screen.findByText('data')

    // Should only be called once - no immediate revalidation on first success
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  test('returns the same data for same query key', async () => {
    function QueryA() {
      const { data } = useQuery({
        queryKey: ['shared'],
        queryFn: () =>
          new Promise<string>((resolve) =>
            setTimeout(() => resolve('shared data'), 50)
          ),
      })
      return <div>A: {data || 'loading'}</div>
    }

    function QueryB() {
      const { data } = useQuery<string>({
        queryKey: ['shared'],
        queryFn: vi.fn(), // Should never be called
      })
      return <div>B: {data || 'loading'}</div>
    }

    renderWithClient(
      <>
        <QueryA />
        <QueryB />
      </>
    )

    // Both components should show same data
    expect(await screen.findByText('A: shared data')).toBeInTheDocument()
    expect(screen.getByText('B: shared data')).toBeInTheDocument()
  })
})
