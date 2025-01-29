# TanStack Query from scratch

A scoped implementation of React Query to understand the core concepts.

## Core features

✅ Basic query caching  
✅ Optimistic updates  
✅ Error handling & rollback  
✅ Garbage collection  
✅ Background revalidation  
✅ Query invalidation  
✅ Deduplication of requests  
✅ Stale-while-revalidate pattern  
✅ Dependent queries  
✅ Parallel queries

## Get it up and running

```bash
git clone https://github.com/tigerabrodi/react-query-from-scratch
pnpm install
pnpm test
```

## Architecture for this implementation

The architecture here is different from the real TanStack query. The real one uses query observers that sit between the component and the query cache. You can read how it works here: [Inside React Query](https://tkdodo.eu/blog/inside-react-query). Their architecture is obviously more complex. It's nice though, because it's easy to create adapters for different frameworks.

### My architecture

```mermaid
graph TD
    %% Main Components
    QueryClient[QueryClient] --> QueryCache[QueryCache]
    QueryCache --> |manages| Cache[(Cache Map)]
    QueryCache --> |manages| PromisesInFlight[(Promises In Flight Map)]
    QueryCache --> |manages| Subscribers[(Subscribers Map)]
    QueryCache --> |manages| GCTimeouts[(GC Timeouts Map)]
    QueryCache --> |manages| GCQueue[(GC Queue Set)]

    %% Hooks
    useQuery --> |uses| useQueryClient
    useQuery --> |uses| useSyncExternalStore
    useQuery --> |initializes| InitialStateRef[Initial State Ref]
    useMutation --> |uses| useQueryClient
    useMutation --> |manages| MutationState[Mutation State]

    %% QueryClient Operations
    QueryClient --> |fetchQuery| HashQueryKey[Hash Query Key]
    QueryClient --> |invalidateQueries| QueryCache
    QueryClient --> |cancelQueries| QueryCache
    QueryClient --> |setQueryData| QueryCache
    QueryClient --> |getQueryData| QueryCache
    QueryClient --> |refetchQueries| QueryCache

    %% QueryCache Core Operations
    QueryCache --> |directQuery| DirectQueryFlow[Direct Query Flow]
    QueryCache --> |backgroundQuery| BackgroundQueryFlow[Background Query Flow]
    QueryCache --> |setData| SetDataFlow[Set Data Flow]
    QueryCache --> |invalidateQuery| InvalidateFlow[Invalidate Flow]
    QueryCache --> |subscribe/unsubscribe| SubscriptionFlow[Subscription Flow]
    QueryCache --> |scheduleGC| GCFlow[GC Flow]

    %% Direct Query Flow Detail
    DirectQueryFlow --> |check| PromiseInFlightCheck{Promise In Flight?}
    PromiseInFlightCheck -->|yes| ReturnExisting[Return Existing Promise]
    PromiseInFlightCheck -->|no| InitialDataCheck{Has Initial Data?}
    InitialDataCheck -->|yes| SetInitialState[Set First Success State]
    InitialDataCheck -->|no| SetLoadingState[Set Loading State]
    SetLoadingState --> ExecuteQueryFn[Execute Query Function]
    ExecuteQueryFn --> HandleResponse{Success/Error}
    HandleResponse -->|success| SetSuccessState[Set Success State]
    HandleResponse -->|error| SetErrorState[Set Error State]

    %% Background Query Flow Detail
    BackgroundQueryFlow --> |check multiple conditions| BackgroundChecks{
        1. No Promise In Flight
        2. Entry Exists
        3. In Success State
        4. Is Stale
        5. Not First Fetch Buffer
    }
    BackgroundChecks -->|all pass| SetFetchingState[Set Fetching State]
    SetFetchingState --> ExecuteBackgroundQuery[Execute Query Function]
    ExecuteBackgroundQuery --> HandleBackgroundResponse{Success/Error}
    HandleBackgroundResponse -->|success| SetNewSuccessState[Set New Success State]
    HandleBackgroundResponse -->|error| RestorePreviousState[Restore Previous State]

    %% Subscription Flow Detail
    SubscriptionFlow --> AddSubscriber[Add Subscriber to Map]
    AddSubscriber --> NotifySubscriber[Notify on State Change]
    SubscriptionFlow --> RemoveSubscriber[Remove Subscriber]
    RemoveSubscriber --> CheckGC{No Subscribers?}
    CheckGC -->|yes| TriggerGC[Schedule GC]

    %% GC Flow Detail
    GCFlow --> CheckExisting[Check Existing Timeout]
    CheckExisting --> SetTimeout[Set New Timeout]
    SetTimeout --> CleanupItems[
        1. Remove from Cache
        2. Remove from Promises
        3. Remove from Subscribers
        4. Remove from GC Timeouts
    ]

    %% States
    subgraph QueryStates
        IdleState[Idle]
        LoadingState[Loading]
        FetchingState[Fetching]
        SuccessState[Success]
        FirstSuccessState[First Success]
        ErrorState[Error]
    end

    %% Mutation Flow
    subgraph MutationFlow
        OnMutate[onMutate] --> CancelQueries
        CancelQueries --> OptimisticUpdate[Set Optimistic Data]
        OptimisticUpdate --> ExecuteMutation[Execute Mutation]
        ExecuteMutation --> HandleMutationResult{Success/Error}
        HandleMutationResult -->|success| OnSuccess[onSuccess]
        HandleMutationResult -->|error| OnError[onError + Rollback]
        OnSuccess --> OnSettled[onSettled]
        OnError --> OnSettled
        OnSettled --> InvalidateRelatedQueries[Invalidate Queries]
    end

    %% Formatting
    classDef core fill:#f9f,stroke:#333,stroke-width:2px
    classDef state fill:#bbf,stroke:#333,stroke-width:1px
    classDef flow fill:#dfd,stroke:#333,stroke-width:1px
    class QueryClient,QueryCache core
    class IdleState,LoadingState,FetchingState,SuccessState,FirstSuccessState,ErrorState state
    class DirectQueryFlow,BackgroundQueryFlow,SetDataFlow,InvalidateFlow,SubscriptionFlow,GCFlow flow
```

# How they handle race conditions

One interesting thing is how the real TanStack Query handles race conditions. They use mutation scopes with queues, where only one mutation can be active per scope. That's how they prevent race conditions. See their [mutationCache.ts](https://github.com/TanStack/query/blob/main/packages/query-core/src/mutationCache.ts).

# Features missing

There is a lot of things that aren't implemented here that from the full TanStack Query implementation.

Query features:

- Prefetching queries (shouldn't be too tricky in hindsight with what I've done here)
- Query retries and retry config (we'd need to retry with exponential backoff)
- Window focus refetching (need to listen to window focus events)
- Network status refetching (need to listen to network status events)
- Polling/refetchInterval (something you'd configure in the query options)
- Infinite queries (for pagination/infinite scroll)
- Suspense queries

For `useSuspenseQuery`, we'd need to throw the promise. I dug into the source code before writing this, but their [useSuspenseQuery](https://github.com/TanStack/query/blob/main/packages/react-query/src/useSuspenseQuery.ts) hook is just a wrapper around `useBaseQuery` which they use. However, suspense is enabled. If it should suspense, they throw the fetch here: [useBaseQuery.ts#L116](https://github.com/TanStack/query/blob/main/packages/react-query/src/useBaseQuery.ts#L116). Very cool.

Mutation features:

- Mutation retries
- Race condition handling
- Mutation queues
- Mutation keys/scoping

---

For learning purposes, this implementation focuses on the core concepts while leaving out more advanced features.
