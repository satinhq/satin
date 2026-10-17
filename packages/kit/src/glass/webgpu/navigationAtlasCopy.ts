import type { FrameGraph, GraphLease, VirtualReplay } from './frameGraph.ts'
import { encodePass, viewOf, type Target } from './passes.ts'
import { glassNow, glassTiming } from './profile.ts'
import type { Request } from '../worker/protocol.ts'

type NavigationAtlasRequest = Extract<Request, { type: 'navigation-atlas' }>

/** Compose the atlas while keeping every copied source alive through queue submission. */
export function copyNavigationAtlasCells(
  device: GPUDevice,
  graph: FrameGraph,
  request: NavigationAtlasRequest,
  target: GraphLease<Target>,
  releaseImages = true,
) {
  const started = glassNow()
  const sources: { release(): void }[] = []
  try {
    const encoder = device.createCommandEncoder()
    encodePass(
      encoder,
      {
        colorAttachments: [
          {
            view: viewOf(target.value.texture),
            loadOp: 'clear',
            clearValue: [...request.background],
            storeOp: 'store',
          },
        ],
      },
      () => {},
      'atlas-clear',
    )
    for (const cell of request.cells) {
      if (!('plane' in cell)) continue
      const image = graph.retain(cell.plane)
      sources.push(image)
      const source = graph.target('front', image.value.width, image.value.height, false, cell.plane)
      sources.push(source)
      graph.upload(image.value, source.value)
      const copyWidth = Math.min(cell.w, source.value.width - cell.sx, request.width - cell.dx)
      const copyHeight = Math.min(cell.h, source.value.height - cell.sy, request.height - cell.dy)
      if (copyWidth > 0 && copyHeight > 0) {
        encoder.copyTextureToTexture(
          { texture: source.value.texture, origin: [cell.sx, cell.sy] },
          { texture: target.value.texture, origin: [cell.dx, cell.dy] },
          [copyWidth, copyHeight],
        )
      }
    }
    glassTiming('navigation-atlas-copy-encode', started)
    const submitStarted = glassNow()
    device.queue.submit([encoder.finish()])
    glassTiming('navigation-atlas-copy-submit', submitStarted)
  } finally {
    // WebGPU retains submitted work; destroying a source before submit invalidates it.
    for (const source of sources.reverse()) source.release()
  }
  for (const cell of request.cells) {
    if ('plane' in cell) continue
    const image = 'image' in cell ? cell.image : cell.canvas
    try {
      const copyWidth = Math.min(image.width, request.width - cell.dx)
      const copyHeight = Math.min(image.height, request.height - cell.dy)
      if (copyWidth > 0 && copyHeight > 0) {
        const uploadStarted = glassNow()
        device.queue.copyExternalImageToTexture(
          { source: image },
          {
            texture: target.value.texture,
            origin: [cell.dx, cell.dy],
            premultipliedAlpha: true,
            colorSpace: 'srgb',
          },
          [copyWidth, copyHeight],
        )
        glassTiming('navigation-atlas-cell-upload', uploadStarted, `${copyWidth}x${copyHeight}`)
      }
    } finally {
      if ('image' in cell && releaseImages) cell.image.close()
    }
  }
}

/** Retain the immutable inputs for exactly as long as the resulting atlas is leased.
 * This lets device restoration repeat the GPU copies without retaining dead textures. */
export async function retainNavigationAtlas(
  graph: FrameGraph,
  request: NavigationAtlasRequest,
): Promise<VirtualReplay> {
  const images: GraphLease<ImageBitmap>[] = []
  const adopted = new Set<ImageBitmap>()
  const cells: NavigationAtlasRequest['cells'][number][] = []
  try {
    for (const [index, cell] of request.cells.entries()) {
      if ('plane' in cell) {
        images.push(graph.retain(cell.plane))
        cells.push({ ...cell })
        continue
      }
      const bitmap = 'image' in cell ? cell.image : await createImageBitmap(cell.canvas)
      adopted.add(bitmap)
      const image = graph.image(`${request.key}:cell:${index}`, bitmap)
      images.push(image)
      // Keep the existing direct upload into the atlas. Retaining the bitmap
      // for replay does not require another intermediate GPU texture.
      cells.push({ image: image.value, dx: cell.dx, dy: cell.dy })
    }
    const recipe = {
      ...request,
      background: [...request.background],
      cells,
    } as NavigationAtlasRequest
    let released = false
    return {
      render(device, target) {
        if (released) throw Error('Navigation atlas reconstruction inputs were released')
        copyNavigationAtlasCells(
          device,
          graph,
          recipe,
          {
            value: target,
            key: request.key,
            release() {},
          },
          false,
        )
      },
      release() {
        if (released) return
        released = true
        for (const image of images) image.release()
      },
    }
  } catch (error) {
    for (const image of images) image.release()
    for (const cell of request.cells)
      if ('image' in cell && !adopted.has(cell.image)) cell.image.close()
    throw error
  }
}
