import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider, useQueryClient } from '../lib/context'
import { QueryClient } from '../lib/query-client'
import { useMutation } from '../lib/use-mutation'
import { useQuery } from '../lib/use-query'

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

describe('Data Interaction Flows', () => {
  test('optimistic updates with rollback on error', async () => {
    let mutationPromise: Promise<unknown> | undefined

    // Why? Critical for UX - users see immediate feedback
    // If broken:
    // 1. No instant feedback on actions
    // 2. Incorrect rollback on errors
    // 3. Inconsistent UI state
    function TodoList() {
      const queryClient = useQueryClient()
      const { data: todos } = useQuery({
        queryKey: ['todos'],
        queryFn: () => Promise.resolve(['Buy milk', 'Walk dog']),
      })

      const { mutateAsync } = useMutation({
        mutationFn: (variables: { text: string }) => {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              reject(new Error('Failed to add'))
            }, 100)
          })
        },
        onMutate: ({ text }) => {
          // Cancel any outgoing refetches
          queryClient.cancelQueries(['todos'])

          // Optimistically update to the new value
          const previousTodos = queryClient.getQueryData<Array<string>>([
            'todos',
          ])
          const optimisticTodos = [...(previousTodos ?? []), text]
          queryClient.setQueryData(['todos'], optimisticTodos)

          return { previousTodos }
        },
        onError: ({ context }) => {
          // Rollback to the previous value
          queryClient.setQueryData(['todos'], context.previousTodos)
        },
        onSettled: () => {
          // Regardless of error or success, invalidate to get fresh data
          queryClient.invalidateQueries(['todos'])
        },
      })

      return (
        <div>
          <ul>{todos?.map((todo, i) => <li key={i}>{todo}</li>)}</ul>
          <button
            onClick={() => {
              mutationPromise = mutateAsync({ text: 'New todo' })
            }}
          >
            Add Todo
          </button>
        </div>
      )
    }

    renderWithClient(<TodoList />)

    // Wait for initial todos
    await screen.findByText('Buy milk')
    await screen.findByText('Walk dog')

    // Click add
    await userEvent.click(screen.getByText('Add Todo'))

    // Should see optimistic update
    expect(screen.getByText('New todo')).toBeInTheDocument()

    await act(async () => {
      await expect(mutationPromise).rejects.toThrow('Failed to add')
    })

    // Should rollback after error
    await waitFor(() => {
      expect(screen.queryByText('New todo')).not.toBeInTheDocument()
      expect(screen.getByText('Buy milk')).toBeInTheDocument()
      expect(screen.getByText('Walk dog')).toBeInTheDocument()
    })
  })

  test('optimistic update with success and refetch', async () => {
    let mutationPromise: Promise<unknown> | undefined
    const serverTodos = ['Buy milk', 'Walk dog']

    function TodoList() {
      const queryClient = useQueryClient()
      const { data: todos } = useQuery({
        queryKey: ['todos'],
        // Clone to avoid mutating the reference
        queryFn: () => Promise.resolve([...serverTodos]),
      })

      const { mutateAsync } = useMutation({
        mutationFn: (variables: { text: string }) => {
          return new Promise((resolve) => {
            setTimeout(() => {
              serverTodos.push(variables.text)
              resolve({ text: variables.text })
            }, 100)
          })
        },
        onMutate: ({ text }) => {
          queryClient.cancelQueries(['todos'])
          const previousTodos = queryClient.getQueryData<Array<string>>([
            'todos',
          ])
          const optimisticTodos = [...(previousTodos ?? []), text]
          queryClient.setQueryData(['todos'], optimisticTodos)
          return { previousTodos }
        },
        onSettled: () => {
          queryClient.invalidateQueries(['todos'])
        },
      })

      return (
        <div>
          <ul>{todos?.map((todo, i) => <li key={i}>{todo}</li>)}</ul>
          <button
            onClick={() => {
              mutationPromise = mutateAsync({ text: 'New todo' })
            }}
          >
            Add Todo
          </button>
        </div>
      )
    }

    renderWithClient(<TodoList />)

    await screen.findByText('Buy milk')
    await screen.findByText('Walk dog')

    await userEvent.click(screen.getByText('Add Todo'))
    expect(screen.getByText('New todo')).toBeInTheDocument()

    await act(async () => {
      await expect(mutationPromise).resolves.toEqual({ text: 'New todo' })
    })

    // Should keep todo after success and refetch
    await waitFor(() => {
      expect(screen.getByText('New todo')).toBeInTheDocument()
    })
  })
})
