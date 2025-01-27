import { createContext, useContext } from 'react'
import { QueryClient } from './query-client'

const QueryClientContext = createContext<QueryClient | undefined>(undefined)

interface QueryClientProviderProps {
  client: QueryClient
  children: React.ReactNode
}

function QueryClientProvider({ client, children }: QueryClientProviderProps) {
  return (
    <QueryClientContext.Provider value={client}>
      {children}
    </QueryClientContext.Provider>
  )
}

function useQueryClient(): QueryClient {
  const client = useContext(QueryClientContext)
  if (!client) {
    throw new Error('No QueryClient set, use QueryClientProvider to set one')
  }
  return client
}

export { QueryClientProvider, useQueryClient }
