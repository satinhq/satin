/** Conservative equality for structured-clone records; opaque values count as changed. */
export function valueEqual(
  left: unknown,
  right: unknown,
  seen = new Map<object, object>(),
): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false
  if (seen.has(left)) return seen.get(left) === right
  seen.set(left, right)
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime()
  if (left instanceof ArrayBuffer && right instanceof ArrayBuffer) {
    return (
      left.byteLength === right.byteLength &&
      new Uint8Array(left).every((byte, index) => byte === new Uint8Array(right)[index])
    )
  }
  if (ArrayBuffer.isView(left) && ArrayBuffer.isView(right)) {
    return (
      left.byteLength === right.byteLength &&
      new Uint8Array(left.buffer, left.byteOffset, left.byteLength).every(
        (byte, index) =>
          byte === new Uint8Array(right.buffer, right.byteOffset, right.byteLength)[index],
      )
    )
  }
  if (left instanceof Map && right instanceof Map) return valueEqual([...left], [...right], seen)
  if (left instanceof Set && right instanceof Set) return valueEqual([...left], [...right], seen)
  if (left instanceof RegExp && right instanceof RegExp)
    return left.source === right.source && left.flags === right.flags
  if (
    !Array.isArray(left) &&
    Object.getPrototypeOf(left) !== Object.prototype &&
    Object.getPrototypeOf(left) !== null
  )
    return false
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      key =>
        Object.hasOwn(right, key) &&
        valueEqual(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
          seen,
        ),
    )
  )
}
