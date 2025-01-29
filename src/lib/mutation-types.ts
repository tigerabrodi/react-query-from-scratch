type BaseMutationState = {
  status: 'idle' | 'loading' | 'error' | 'success'
}

type IdleMutationState = BaseMutationState & {
  status: 'idle'
  data: undefined
  error: null
}

type LoadingMutationState = BaseMutationState & {
  status: 'loading'
  data: undefined
  error: null
}

type ErrorMutationState = BaseMutationState & {
  status: 'error'
  data: undefined
  error: Error
}

type SuccessMutationState<TData> = BaseMutationState & {
  status: 'success'
  data: TData
  error: null
}

export type MutationState<TData> =
  | IdleMutationState
  | LoadingMutationState
  | ErrorMutationState
  | SuccessMutationState<TData>

export type MutationKey = ReadonlyArray<unknown>

export interface UseMutationOptions<
  TData,
  TVariables = unknown,
  TContext = unknown,
> {
  mutationFn: (variables: TVariables) => Promise<TData>
  onMutate?: (variables: NoInfer<TVariables>) => Promise<TContext> | TContext
  onSuccess?: (params: {
    data: TData
    variables: NoInfer<TVariables>
    context: TContext
  }) => Promise<unknown> | void
  onError?: (params: {
    error: Error
    variables: NoInfer<TVariables>
    context: TContext
  }) => Promise<unknown> | void
  onSettled?: (params: {
    data: TData | undefined
    error: Error | null
    variables: NoInfer<TVariables>
    context: TContext
  }) => Promise<unknown> | void
}

export type UseMutationResult<TData, TVariables> = {
  status: MutationState<TData>['status']
  data: TData | undefined
  error: Error | null
  isLoading: boolean
  isError: boolean
  isSuccess: boolean
  mutate: (variables: TVariables) => void
  mutateAsync: (variables: TVariables) => Promise<TData>
  reset: () => void
}
