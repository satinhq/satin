import { describe, expect, it } from 'vitest'
import { homeScene } from './installExperienceHome.ts'

describe('install page Home Screen icon', () => {
  it('clips the app icon with a shape defined in the same drawing', () => {
    const scene = homeScene('/icon.png')
    const referenced = [...scene.matchAll(/class="ix-app"[^>]*clip-path="url\(#([^)]+)\)"/g)].map(
      match => match[1],
    )
    expect(referenced.length).toBeGreaterThan(0)
    for (const id of referenced) expect(scene).toContain(`<clipPath id="${id}"`)
  })
})
