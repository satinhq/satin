import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { installQrMatrix } from './installQr.ts'

const fingerprint = (rows: boolean[][]) =>
  createHash('sha256')
    .update(rows.map(row => row.map(dark => (dark ? 1 : 0)).join('')).join('\n'))
    .digest('hex')
    .slice(0, 16)

describe('install page QR code', () => {
  // Both matrices were decoded back to their text with CoreImage's QR detector (2026-10-02).
  it.each([
    ['https://a.co/i', 21, 'f6a68a338c2e1f31'],
    ['https://reps.example.com/install', 25, '34189814e90cf57a'],
  ])('encodes %s as the verified matrix', (text, size, expected) => {
    const rows = installQrMatrix(text)!
    expect(rows).toHaveLength(size)
    expect(rows.every(row => row.length === size)).toBe(true)
    expect(fingerprint(rows)).toBe(expected)
  })

  it('draws the three finder patterns and the dark module', () => {
    const rows = installQrMatrix('https://a.co/i')!
    const size = rows.length
    for (const [column, row] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ] as const) {
      expect(rows[row]!.slice(column, column + 7).every(Boolean)).toBe(true)
      expect(rows[row + 3]![column + 3]).toBe(true)
      expect(rows[row + 1]![column + 1]).toBe(false)
    }
    expect(rows[size - 8]![8]).toBe(true)
  })

  it('grows with the text and gives up beyond version 5', () => {
    expect(installQrMatrix('a'.repeat(17))).toHaveLength(21)
    expect(installQrMatrix('a'.repeat(18))).toHaveLength(25)
    expect(installQrMatrix('a'.repeat(106))).toHaveLength(37)
    expect(installQrMatrix('a'.repeat(107))).toBeNull()
  })
})
