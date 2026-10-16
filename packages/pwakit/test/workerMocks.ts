import { expect } from 'vitest'

export type WorkerReply = {
  id?: number
  value?: { frames?: { message?: string; restart: boolean; interval?: number | null }[] }
  error?: string
  glassError?: { stage: string }
}
export function frameProbeMock(state: { fail: string }) {
  return {
    FrameProbe: class {
      useDevice() {}
      flush() {}
      frame(
        _kind: unknown,
        _interval: unknown,
        _restart: unknown,
        encode: (encoder: unknown) => void,
      ) {
        encode({})
        if (state.fail === 'submission') throw Error('submission draw failed')
      }
    },
  }
}

export function gpuScopeMock() {
  return {
    gpuScope: (_device: unknown, _label: string, draw: () => void) => draw(),
  }
}

export function backdropMock() {
  return {
    Backdrop: {
      for: () => ({
        suspend() {},
        report() {
          return []
        },
      }),
    },
  }
}

export function workerMessageQueue(posted: () => WorkerReply[], nextId: () => number) {
  const flush = async () => {
    for (let i = 0; i < 200; i++) await Promise.resolve()
  }
  const enqueue = (request: Record<string, unknown>) => {
    const requestId = nextId()
    ;(globalThis as unknown as { onmessage: (event: unknown) => void }).onmessage({
      data: { id: requestId, request },
    })
    return requestId
  }
  const reply = (requestId: number) => posted().find(p => p.id === requestId)
  async function send(request: Record<string, unknown>) {
    const requestId = enqueue(request)
    await flush()
    expect(reply(requestId), String(request.type)).toBeDefined()
    return reply(requestId)!
  }
  return { flush, enqueue, reply, send }
}
