import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }),
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.goto('http://127.0.0.1:5173/?m2', { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__tileToy?.renderer?.drawCalls))
await mkdir('tmp', { recursive: true })
await page.screenshot({ path: 'tmp/m2-sample.png' })

const sample = await page.evaluate(() => ({ tiles: window.__tileToy.renderer.tileCount,
  calls: window.__tileToy.renderer.drawCalls }))
assert.equal(sample.tiles, 50)
assert.ok(sample.calls <= 8, `sample draw calls: ${sample.calls}`)
await page.getByRole('button', { name: 'Show ghost' }).click()
await page.screenshot({ path: 'tmp/m2-valid-ghost.png' })
await page.getByRole('button', { name: 'Ghost: valid' }).click()
await page.screenshot({ path: 'tmp/m2-invalid-ghost.png' })
await page.getByRole('button', { name: 'Ghost: invalid' }).click()

await page.evaluate(() => {
  const app = window.__tileToy
  app.renderer.camera.setView({ x: 0, y: 0 }, 2)
  app.renderer.requestRender()
})
await page.screenshot({ path: 'tmp/m2-min-zoom.png' })
await page.evaluate(() => {
  const app = window.__tileToy
  app.renderer.camera.setView({ x: 0, y: 0 }, 40)
  app.renderer.requestRender()
})
await page.screenshot({ path: 'tmp/m2-max-zoom.png' })

await page.getByRole('button', { name: '500 tiles' }).click()
await page.waitForFunction(() => window.__tileToy.renderer.tileCount === 500 &&
  window.__tileToy.renderer.drawCalls > 0)
const stress = await page.evaluate(() => ({ tiles: window.__tileToy.renderer.tileCount,
  calls: window.__tileToy.renderer.drawCalls,
  height: window.__tileToy.renderer.camera.visibleHeight }))
assert.equal(stress.tiles, 500)
assert.ok(stress.calls <= 8, `stress draw calls: ${stress.calls}`)
await page.screenshot({ path: 'tmp/m2-500-tiles.png' })

const beforePan = await page.evaluate(() => window.__tileToy.renderer.camera.center)
await page.mouse.move(640, 400)
await page.mouse.down()
await page.mouse.move(760, 450, { steps: 8 })
await page.mouse.up()
const afterPan = await page.evaluate(() => window.__tileToy.renderer.camera.center)
assert.ok(afterPan.x < beforePan.x && afterPan.y > beforePan.y, 'mouse pan did not move camera')

const wheel = await page.evaluate(() => ({ point: window.__tileToy.renderer.camera.screenToWorld(420, 320),
  height: window.__tileToy.renderer.camera.visibleHeight }))
await page.mouse.move(420, 320)
await page.mouse.wheel(0, -180)
const afterWheel = await page.evaluate(() => ({ point: window.__tileToy.renderer.camera.screenToWorld(420, 320),
  height: window.__tileToy.renderer.camera.visibleHeight }))
assert.ok(afterWheel.height < wheel.height, 'wheel did not zoom in')
assert.ok(Math.abs(afterWheel.point.x - wheel.point.x) < 1e-6)
assert.ok(Math.abs(afterWheel.point.y - wheel.point.y) < 1e-6)

const cdp = await page.context().newCDPSession(page)
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type,
  touchPoints: points.map(([x, y], id) => ({ x, y, id })) })
const beforePinch = await page.evaluate(() => window.__tileToy.renderer.camera.visibleHeight)
await touch('touchStart', [[500, 500], [700, 500]])
await touch('touchMove', [[450, 500], [750, 500]])
await touch('touchEnd', [])
const afterPinch = await page.evaluate(() => window.__tileToy.renderer.camera.visibleHeight)
assert.ok(afterPinch < beforePinch, 'touch pinch did not zoom in')
const beforeTouchPan = await page.evaluate(() => window.__tileToy.renderer.camera.center)
await touch('touchStart', [[600, 500]])
await touch('touchMove', [[650, 530]])
await touch('touchEnd', [])
const afterTouchPan = await page.evaluate(() => window.__tileToy.renderer.camera.center)
assert.ok(afterTouchPan.x < beforeTouchPan.x && afterTouchPan.y > beforeTouchPan.y,
  'single-touch pan did not move camera')

const durations = await page.evaluate(async () => {
  const app = window.__tileToy
  const samples = []
  let previous = performance.now()
  for (let i = 0; i < 120; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const now = performance.now()
    if (i > 5) samples.push(now - previous)
    previous = now
    app.renderer.camera.panPixels(0.5, 0)
    app.renderer.requestRender()
  }
  return samples.sort((a, b) => a - b)
})
const median = durations[Math.floor(durations.length / 2)]
const p95 = durations[Math.floor(durations.length * 0.95)]
assert.ok(median <= 20, `500 tile median frame interval: ${median.toFixed(1)}ms`)
assert.ok(p95 <= 25, `500 tile p95 frame interval: ${p95.toFixed(1)}ms`)
await page.setViewportSize({ width: 900, height: 650 })
await page.waitForFunction(() => document.querySelector('canvas')?.width === 900)
assert.equal(await page.evaluate(() => document.querySelector('canvas')?.height), 650)
assert.deepEqual(errors, [])
console.log(JSON.stringify({ sample, stress, mousePan: true, wheelZoom: true,
  touchPan: true, touchPinch: true, resize: true,
  medianFrameMs: median.toFixed(1), p95FrameMs: p95.toFixed(1),
  screenshots: 'tmp/m2-*.png' }, null, 2))
await browser.close()
