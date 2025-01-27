export function getDifferenceInMs({
  startTime,
  endTime,
}: {
  startTime: number
  endTime: number
}) {
  return endTime - startTime
}
