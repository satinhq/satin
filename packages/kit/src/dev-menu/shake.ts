type MotionPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> }

/** Permission is requested only inside the menu's explicit button gesture. */
export async function enableShake(open: () => void): Promise<() => void> {
  if (typeof DeviceMotionEvent === 'undefined') throw new Error('Motion events are unavailable.')
  const motion = DeviceMotionEvent as MotionPermission
  if (motion.requestPermission && (await motion.requestPermission()) !== 'granted') {
    throw new Error('Motion permission was denied.')
  }
  let lastPeak = 0
  let peaks = 0
  let lastOpen = -Infinity
  let aboveThreshold = false
  const onMotion = (event: DeviceMotionEvent) => {
    const acceleration = event.acceleration
    if (document.visibilityState === 'hidden' || !acceleration) return
    const magnitude = Math.hypot(acceleration.x ?? 0, acceleration.y ?? 0, acceleration.z ?? 0)
    if (magnitude < 10) aboveThreshold = false
    if (magnitude < 18 || aboveThreshold) return
    aboveThreshold = true
    const now = performance.now()
    if (now - lastPeak < 100 || now - lastOpen < 2_000) return
    peaks = now - lastPeak < 800 ? peaks + 1 : 1
    lastPeak = now
    if (peaks >= 3) {
      peaks = 0
      lastOpen = now
      open()
    }
  }
  window.addEventListener('devicemotion', onMotion)
  return () => window.removeEventListener('devicemotion', onMotion)
}
