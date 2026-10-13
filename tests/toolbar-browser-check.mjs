import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }),
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('dialog', (dialog) => dialog.accept())
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.evaluate(() => window.__tileToyEditor.ready)
await mkdir('tmp', { recursive: true })

await page.getByRole('button', { name: 'Add square' }).click()
const toolbar = page.getByRole('toolbar', { name: 'Selected tile actions' })
assert.equal(await toolbar.getAttribute('class').then((name) => name.includes('pinned')), true)
const topBounds = await toolbar.boundingBox()
assert.ok(topBounds.y >= 10 && topBounds.y < 40)
await page.screenshot({ path: 'tmp/toolbar-top.png' })

await page.getByRole('button', { name: 'Scene menu' }).click()
await page.getByRole('menuitem', { name: 'Save scene' }).click()
await page.getByRole('textbox', { name: 'Scene name' }).fill('Toolbar study')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForFunction(() => !window.__tileToyEditor.workspace.dirty)
const sceneJson = await page.evaluate(() => window.__tileToyEditor.workspace.exportScene())

await page.getByRole('button', { name: 'Pin actions to top' }).click()
assert.equal(await toolbar.getAttribute('class').then((name) => name.includes('pinned')), false)
const floatingBounds = await toolbar.boundingBox()
assert.ok(floatingBounds.y > 150, `floating toolbar stayed at top: ${floatingBounds.y}`)
assert.equal(await page.getByRole('button', { name: 'Pin actions to top' }).getAttribute('aria-pressed'), 'false')
assert.equal(await page.evaluate(() => window.__tileToyEditor.workspace.dirty), false)
assert.equal(await page.evaluate(() => window.__tileToyEditor.workspace.exportScene()), sceneJson)
await page.screenshot({ path: 'tmp/toolbar-floating.png' })
await page.waitForFunction(() => document.querySelector('#status').textContent.includes('follow the selected tile'))

await page.reload({ waitUntil: 'networkidle' })
await page.evaluate(() => window.__tileToyEditor.ready)
assert.equal(await page.evaluate(() => window.__tileToyEditor.workspace.toolbarPlacement), 'floating')
const squareCenter = await page.evaluate(() => {
  const { model, renderer } = window.__tileToyEditor
  const tile = model.scene.tiles[0]
  const angle = tile.rotation * Math.PI / 180
  return renderer.camera.worldToScreen({
    x: tile.x + 0.5 * Math.cos(angle) - 0.5 * Math.sin(angle),
    y: tile.y + 0.5 * Math.sin(angle) + 0.5 * Math.cos(angle),
  })
})
await page.mouse.click(squareCenter.x, squareCenter.y)
assert.equal(await toolbar.getAttribute('class').then((name) => name.includes('pinned')), false)
await page.getByRole('button', { name: 'Pin actions to top' }).click()
assert.equal(await toolbar.getAttribute('class').then((name) => name.includes('pinned')), true)
assert.ok((await toolbar.boundingBox()).y < 40)
await page.waitForFunction(() => document.querySelector('#status').textContent.includes('pinned to the top'))

await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const mobileBounds = await toolbar.boundingBox()
assert.ok(mobileBounds.x >= 0 && mobileBounds.x + mobileBounds.width <= 390)
assert.ok(mobileBounds.y >= 68 && mobileBounds.y < 110)
await page.screenshot({ path: 'tmp/toolbar-mobile.png' })
await page.reload({ waitUntil: 'networkidle' })
await page.evaluate(() => window.__tileToyEditor.ready)
assert.equal(await page.evaluate(() => window.__tileToyEditor.workspace.toolbarPlacement), 'top')
assert.deepEqual(errors, [])
console.log(JSON.stringify({ pinnedDefault: true, floatingOption: true, preferencePersists: true,
  sceneUnchanged: true, mobilePlacement: true, screenshots: 'tmp/toolbar-*.png' }, null, 2))
await browser.close()
