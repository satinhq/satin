import { expect, it } from 'vitest'
import { MotionProbeOutbox, motionBeacon } from './motionProbeDelivery.ts'

it('retries the full background report across reload and retains failed uploads', async () => {
  let saved = ''
  const storage = {
    getItem: () => saved || null,
    setItem: (_: string, value: string) => {
      saved = value
    },
  }
  const body = JSON.stringify({ client: 'phone', windows: [{ id: 1, end: 10 }] })
  expect(new MotionProbeOutbox(storage, 'probe').save(body)).toBe(true)
  const next = new MotionProbeOutbox(storage, 'probe')
  expect(await next.drain(async () => false)).toBe(false)
  const sent: string[] = []
  expect(
    await next.drain(async body => {
      sent.push(body)
      return true
    }),
  ).toBe(true)
  expect(sent).toEqual([body])
  expect(JSON.parse(saved)).toEqual([])
})

it('does not acknowledge a newer cumulative snapshot when an older POST finishes', async () => {
  const box = new MotionProbeOutbox(undefined, 'probe')
  box.save(JSON.stringify({ client: 'a', at: 1 }))
  await box.drain(async () => {
    box.save(JSON.stringify({ client: 'a', at: 2 }))
    return true
  })
  const sent: unknown[] = []
  await box.drain(async body => {
    sent.push(JSON.parse(body))
    return true
  })
  expect(sent).toEqual([{ client: 'a', at: 2 }])
})

it('bounds beacon bytes and labels truncated samples instead of claiming full delivery', async () => {
  const samples = Array.from({ length: 1000 }, (_, at) => ({ at, data: 'x'.repeat(1000) }))
  const body = JSON.stringify({
    windows: [{ frames: samples, inputTimes: [] }],
    touchSamples: samples,
    navigationFrames: samples,
    preparations: samples,
    summaries: [],
  })
  const blob = motionBeacon(body)!
  expect(blob.size).toBeLessThanOrEqual(60 * 1024)
  const copy = JSON.parse(await blob.text())
  expect(copy.delivery).toMatchObject({ compact: true, fullReportPending: true })
  expect(copy.touchSamples.at(-1).at).toBe(999)
})
