import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }),
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const errors = []
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} should equal ${b}`)
page.on('pageerror', (error) => errors.push(error.message))
page.on('dialog', (dialog) => dialog.accept())
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__tileToyEditor?.model))
await mkdir('tmp', { recursive: true })

const state = () => page.evaluate(() => {
  const { model } = window.__tileToyEditor
  return { tiles: model.scene.tiles.map((tile) => ({ ...tile })),
    groups: model.scene.groups.map((group) => ({ ...group })),
    stamps: model.library.stamps.map((stamp) => ({ ...stamp })),
    selection: model.selectedTiles.length }
})

await page.evaluate(() => {
  const { model, sceneChanged } = window.__tileToyEditor
  const triangles = Array.from({ length: 6 }, (_, index) => ({
    id: `triangle-${index}`, shape: 'triangle', x: 0, y: 0, z: 0,
    rotation: index * 60, color: index, groupId: null,
  }))
  model.loadScene({ ...model.scene, tiles: triangles })
  model.select(triangles[0].id)
  sceneChanged()
})

await page.getByRole('button', { name: 'Save as stamp' }).click()
assert.equal((await state()).stamps[0].tiles.length, 6)
assert.equal(await page.locator('.stamp-thumbnail polygon').count(), 6)
await page.screenshot({ path: 'tmp/m4-library.png' })
await page.getByRole('button', { name: 'Rename Stamp 1' }).click()
await page.getByRole('textbox', { name: 'New name for Stamp 1' }).fill('Hexagon')
await page.getByRole('textbox', { name: 'New name for Stamp 1' }).press('Enter')
assert.equal((await state()).stamps[0].name, 'Hexagon')

await page.getByRole('button', { name: 'Scene menu' }).click()
await page.getByRole('menuitem', { name: 'New scene' }).click()
assert.equal((await state()).tiles.length, 0)
assert.equal((await state()).stamps.length, 1)
await page.getByRole('button', { name: 'Place Hexagon' }).click()
let current = await state()
assert.equal(current.tiles.length, 6)
assert.equal(current.groups.length, 1)
assert.equal(current.selection, 6)
const start = current.tiles.map((tile) => ({ x: tile.x, y: tile.y, rotation: tile.rotation }))
const dragPoints = await page.evaluate(() => {
  const { renderer, model } = window.__tileToyEditor
  const first = model.scene.tiles[0]
  const center = { x: first.x + 0.5, y: first.y + Math.sqrt(3) / 6 }
  return { from: renderer.camera.worldToScreen(center),
    to: renderer.camera.worldToScreen({ x: center.x + 1.5, y: center.y }) }
})
await page.mouse.move(dragPoints.from.x, dragPoints.from.y)
await page.mouse.down()
await page.mouse.move(dragPoints.to.x, dragPoints.to.y, { steps: 10 })
await page.mouse.up()
current = await state()
current.tiles.forEach((tile, index) => close(tile.x - start[index].x, 1.5))
for (let index = 0; index < 6; index++)
  await page.getByRole('button', { name: 'Rotate clockwise 15 degrees' }).click()
current = await state()
current.tiles.forEach((tile, index) => assert.equal(tile.rotation, start[index].rotation + 90))
await page.screenshot({ path: 'tmp/m4-placed.png' })

await page.getByRole('button', { name: 'Add square' }).click()
const freeSquareDrag = await page.evaluate(() => {
  const { model, renderer } = window.__tileToyEditor
  const tile = model.scene.tiles.at(-1)
  const center = { x: tile.x + 0.5, y: tile.y + 0.5 }
  return { from: renderer.camera.worldToScreen(center),
    to: renderer.camera.worldToScreen({ x: center.x + 4, y: center.y }) }
})
await page.mouse.move(freeSquareDrag.from.x, freeSquareDrag.from.y)
await page.mouse.down()
await page.mouse.move(freeSquareDrag.to.x, freeSquareDrag.to.y, { steps: 10 })
await page.mouse.up()
await page.getByRole('button', { name: 'Rotate clockwise 15 degrees' }).click()
await page.getByRole('button', { name: 'Rotate clockwise 15 degrees' }).click()
const squareDrag = await page.evaluate(() => {
  const { renderer, model } = window.__tileToyEditor
  const triangle = model.scene.tiles[0]
  const square = model.scene.tiles.at(-1)
  const radians = triangle.rotation * Math.PI / 180
  const corner = { x: triangle.x + 0.5 * Math.cos(radians) - Math.sqrt(3) / 2 * Math.sin(radians),
    y: triangle.y + 0.5 * Math.sin(radians) + Math.sqrt(3) / 2 * Math.cos(radians) }
  const angle = square.rotation * Math.PI / 180
  const center = { x: square.x + 0.5 * Math.cos(angle) - 0.5 * Math.sin(angle),
    y: square.y + 0.5 * Math.sin(angle) + 0.5 * Math.cos(angle) }
  return { target: corner, from: renderer.camera.worldToScreen(center),
    to: renderer.camera.worldToScreen({ x: center.x + corner.x - square.x - 0.04,
      y: center.y + corner.y - square.y - 0.03 }) }
})
await page.mouse.move(squareDrag.from.x, squareDrag.from.y)
await page.mouse.down()
await page.mouse.move(squareDrag.to.x, squareDrag.to.y, { steps: 10 })
await page.mouse.up()
current = await state()
close(current.tiles.at(-1).x, squareDrag.target.x)
close(current.tiles.at(-1).y, squareDrag.target.y)
await page.screenshot({ path: 'tmp/m4-snapped.png' })

const groupPoint = await page.evaluate(() => {
  const { model, renderer } = window.__tileToyEditor
  const tile = model.scene.tiles[0]
  const radians = tile.rotation * Math.PI / 180
  return renderer.camera.worldToScreen({
    x: tile.x + 0.5 * Math.cos(radians) - Math.sqrt(3) / 6 * Math.sin(radians),
    y: tile.y + 0.5 * Math.sin(radians) + Math.sqrt(3) / 6 * Math.cos(radians),
  })
})
await page.mouse.click(groupPoint.x, groupPoint.y)
assert.equal((await state()).selection, 6)

await page.getByRole('button', { name: 'Ungroup selected stamp' }).click()
current = await state()
assert.equal(current.groups.length, 0)
assert.equal(current.selection, 1)
assert.ok(current.tiles.every((tile) => tile.groupId === null))
await page.getByRole('button', { name: 'Undo' }).click()
assert.equal((await state()).groups.length, 1)
await page.getByRole('button', { name: 'Redo' }).click()
assert.equal((await state()).groups.length, 0)

await page.getByRole('button', { name: 'Stamps' }).click()
await page.getByRole('button', { name: 'Delete Hexagon' }).click()
assert.equal((await state()).stamps.length, 0)
assert.equal((await state()).tiles.length, 7)
await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
for (const selector of ['.palette-tray', '.library-tray']) {
  const bounds = await page.locator(selector).boundingBox()
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 &&
    bounds.y + bounds.height <= 844, `${selector} escapes the mobile viewport`)
}
await page.screenshot({ path: 'tmp/m4-mobile.png' })
assert.deepEqual(errors, [])
console.log(JSON.stringify({ sixTileStamp: true, thumbnail: true, rename: true,
  newScene: true, place: true, groupMove: true, rotate90: true, boundarySnap: true,
  ungroup: true, undoRedo: true,
  deleteKeepsPlacedTiles: true, screenshots: 'tmp/m4-*.png' }, null, 2))
await browser.close()
