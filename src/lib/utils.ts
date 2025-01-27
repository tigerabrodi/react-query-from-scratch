export function getDifferenceInMs({
  startTime,
  endTime,
}: {
  startTime: number
  endTime: number
}) {
  return endTime - startTime
}

export async function handlePromise<PromiseResult>({
  promise,
  finallyCb,
}: {
  promise: Promise<PromiseResult>
  finallyCb?: () => void
}): Promise<[PromiseResult, null] | [null, Error]> {
  try {
    const result = await promise
    return [result, null]
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))]
  } finally {
    finallyCb?.()
  }
}
