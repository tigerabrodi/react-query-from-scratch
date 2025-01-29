/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable no-prototype-builtins */

import { QueryKey } from './query-types'

// Copied from: https://github.com/jonschlinkert/is-plain-object
export function isPlainObject(o: any): o is object {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has no constructor

  const ctor = o.constructor
  if (ctor === undefined) {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false
  }

  // Handles Objects created by Object.create(<arbitrary prototype>)
  if (Object.getPrototypeOf(o) !== Object.prototype) {
    return false
  }

  // Most likely a plain Object
  return true
}

function hasObjectPrototype(o: any): boolean {
  return Object.prototype.toString.call(o) === '[object Object]'
}

/**
 * Taken from: https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts#L217
 * Default query & mutation keys hash function.
 * Hashes the value into a stable hash.
 */
export function hashKey(queryKey: QueryKey): string {
  return JSON.stringify(queryKey, (_, val) =>
    isPlainObject(val)
      ? Object.keys(val)
          .sort()
          .reduce(
            (result: Record<string, unknown>, key: string) => {
              // Type assertion here since we know it's a plain object
              const obj = val as Record<string, unknown>
              result[key] = obj[key]
              return result
            },
            {} as Record<string, unknown>
          )
      : val
  )
}
