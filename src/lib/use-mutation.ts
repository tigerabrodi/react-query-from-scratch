import { useCallback, useState } from 'react'
import type {
  MutationState,
  UseMutationOptions,
  UseMutationResult,
} from './mutation-types'

export function useMutation<TData, TVariables, TContext = unknown>(
  options: UseMutationOptions<TData, TVariables, TContext>
): UseMutationResult<TData, TVariables> {
  const [state, setState] = useState<MutationState<TData>>({
    status: 'idle',
    data: undefined,
    error: null,
  })

  const reset = useCallback(() => {
    setState({ status: 'idle', data: undefined, error: null })
  }, [])

  const mutate = useCallback(
    async (variables: TVariables) => {
      let context: TContext | undefined

      try {
        if (options.onMutate) {
          context = await options.onMutate(variables)
        }

        setState({ status: 'loading', data: undefined, error: null })

        const data = await options.mutationFn(variables)

        setState({ status: 'success', data, error: null })

        if (options.onSuccess) {
          await options.onSuccess({
            data,
            variables,
            context: context as TContext,
          })
        }

        if (options.onSettled) {
          await options.onSettled({
            data,
            error: null,
            variables,
            context: context as TContext,
          })
        }

        return data
      } catch (error) {
        const typedError =
          error instanceof Error ? error : new Error(String(error))
        setState({ status: 'error', data: undefined, error: typedError })

        if (options.onError) {
          await options.onError({
            error: typedError,
            variables,
            context: context as TContext,
          })
        }

        if (options.onSettled) {
          await options.onSettled({
            data: undefined,
            error: typedError,
            variables,
            context: context as TContext,
          })
        }

        throw typedError
      }
    },
    [options]
  )

  const mutateAsync = useCallback(
    (variables: TVariables) => mutate(variables),
    [mutate]
  )

  return {
    ...state,
    isLoading: state.status === 'loading',
    isError: state.status === 'error',
    isSuccess: state.status === 'success',
    mutate: (vars: TVariables) => void mutate(vars),
    mutateAsync,
    reset,
  }
}
