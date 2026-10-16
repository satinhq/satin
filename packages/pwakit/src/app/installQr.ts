/**
 * A small QR encoder for the install page's "open this on your iPhone" code.
 *
 * Byte mode, error correction level L, versions 1 to 5 (up to 106 bytes), mask 0.
 * Returns the module rows (true = dark), or null when the text is too long.
 *
 * Self-contained: embedded verbatim in the install page, so it must not reference
 * anything outside its own body.
 */
export function installQrMatrix(text: string): boolean[][] | null {
  const bytes = Array.from(new TextEncoder().encode(text))
  // [data codewords, error correction codewords] for versions 1 to 5 at level L.
  const capacities = [
    [19, 7],
    [34, 10],
    [55, 15],
    [80, 20],
    [108, 26],
  ]
  const version = capacities.findIndex(([data]) => bytes.length <= data! - 2) + 1
  if (!version) return null
  const [dataLength, eccLength] = capacities[version - 1] as [number, number]
  const size = 17 + 4 * version

  // Data codewords: mode 0100, an 8-bit length, the bytes, a terminator, then pad bytes.
  const bits: number[] = []
  const push = (value: number, length: number) => {
    for (let bit = length - 1; bit >= 0; bit--) bits.push((value >>> bit) & 1)
  }
  push(4, 4)
  push(bytes.length, 8)
  for (const byte of bytes) push(byte, 8)
  push(0, Math.min(4, dataLength * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  for (let pad = 0xec; bits.length < dataLength * 8; pad ^= 0xec ^ 0x11) push(pad, 8)
  const codewords: number[] = []
  for (let index = 0; index < bits.length; index += 8) {
    codewords.push(bits.slice(index, index + 8).reduce((sum, bit) => (sum << 1) | bit, 0))
  }

  // Reed-Solomon error correction over GF(256), polynomial 0x11d.
  const multiply = (left: number, right: number) => {
    let product = 0
    for (let bit = 7; bit >= 0; bit--) {
      product = (product << 1) ^ ((product >>> 7) * 0x11d)
      product ^= ((right >>> bit) & 1) * left
    }
    return product
  }
  const divisor = new Array<number>(eccLength).fill(0)
  divisor[eccLength - 1] = 1
  for (let degree = 0, root = 1; degree < eccLength; degree++, root = multiply(root, 2)) {
    for (let index = 0; index < eccLength; index++) {
      divisor[index] = multiply(divisor[index]!, root) ^ (divisor[index + 1] ?? 0)
    }
  }
  const remainder = new Array<number>(eccLength).fill(0)
  for (const codeword of codewords) {
    const factor = codeword ^ remainder.shift()!
    remainder.push(0)
    divisor.forEach((coefficient, index) => {
      remainder[index]! ^= multiply(coefficient, factor)
    })
  }
  const stream = codewords.concat(remainder)

  // Function patterns. `reserved` marks every module the data must skip.
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (column: number, row: number, dark: boolean) => {
    if (column < 0 || row < 0 || column >= size || row >= size) return
    modules[row]![column] = dark
    reserved[row]![column] = true
  }
  for (let index = 0; index < size; index++) {
    set(6, index, index % 2 === 0)
    set(index, 6, index % 2 === 0)
  }
  const finder = (centreColumn: number, centreRow: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dy))
        set(centreColumn + dx, centreRow + dy, ring !== 2 && ring !== 4)
      }
    }
  }
  finder(3, 3)
  finder(size - 4, 3)
  finder(3, size - 4)
  if (version > 1) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        set(size - 7 + dx, size - 7 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }

  // Format information for level L and mask 0, with its BCH check bits.
  const format = 1 << 3
  let check = format
  for (let step = 0; step < 10; step++) check = (check << 1) ^ ((check >>> 9) * 0x537)
  const formatBits = ((format << 10) | check) ^ 0x5412
  const formatBit = (index: number) => ((formatBits >>> index) & 1) === 1
  for (let index = 0; index <= 5; index++) set(8, index, formatBit(index))
  set(8, 7, formatBit(6))
  set(8, 8, formatBit(7))
  set(7, 8, formatBit(8))
  for (let index = 9; index < 15; index++) set(14 - index, 8, formatBit(index))
  for (let index = 0; index < 8; index++) set(size - 1 - index, 8, formatBit(index))
  for (let index = 8; index < 15; index++) set(8, size - 15 + index, formatBit(index))
  set(8, size - 8, true)

  // Data modules in the zigzag order, with mask 0 applied: (row + column) is even.
  let position = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step++) {
      for (let side = 0; side < 2; side++) {
        const column = right - side
        const upward = ((right + 1) & 2) === 0
        const row = upward ? size - 1 - step : step
        if (reserved[row]![column]) continue
        const bit =
          position < stream.length * 8 &&
          ((stream[position >>> 3]! >>> (7 - (position & 7))) & 1) === 1
        modules[row]![column] = bit !== ((row + column) % 2 === 0)
        position++
      }
    }
  }
  return modules
}
