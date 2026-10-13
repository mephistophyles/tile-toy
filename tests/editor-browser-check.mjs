import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }),
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  hasTouch: true })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__tileToyEditor?.model))
await mkdir('tmp', { recursive: true })
const state = () => page.evaluate(() => ({
  tiles: window.__tileToyEditor.model.scene.tiles.map((tile) => ({ ...tile })),
  selectedId: window.__tileToyEditor.model.selectedId,
  color: window.__tileToyEditor.model.activeColor,
  canUndo: window.__tileToyEditor.model.history.canUndo,
  canRedo: window.__tileToyEditor.model.history.canRedo,
}))
const screen = (x, y) => page.evaluate(({ x, y }) =>
  window.__tileToyEditor.renderer.camera.worldToScreen({ x, y }), { x, y })
const squareCenter = async (id) => {
  const tile = (await state()).tiles.find((item) => item.id === id)
  assert.ok(tile, `missing tile ${id}`)
  return screen(tile.x + 0.5, tile.y + 0.5)
}
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}
const dragSquareTo = async (id, x, y) =>
  drag(await squareCenter(id), await screen(x + 0.5, y + 0.5))

assert.equal((await state()).tiles.length, 0)
await page.screenshot({ path: 'tmp/m3-empty.png' })
await page.getByRole('button', { name: 'Blue' }).click()
await page.getByRole('button', { name: 'Add square' }).click()
let current = await state()
assert.equal(current.tiles.length, 1)
assert.equal(current.tiles[0].color, 4)
const firstId = current.tiles[0].id
assert.equal(current.selectedId, firstId)
await page.screenshot({ path: 'tmp/m3-selected.png' })

await page.getByRole('button', { name: 'Undo' }).click()
assert.equal((await state()).tiles.length, 0)
await page.getByRole('button', { name: 'Redo' }).click()
assert.equal((await state()).tiles.length, 1)

await page.touchscreen.tap(950, 430)
assert.equal((await state()).selectedId, null)
const firstPoint = await squareCenter(firstId)
await page.touchscreen.tap(firstPoint.x, firstPoint.y)
assert.equal((await state()).selectedId, firstId)

await page.getByRole('button', { name: 'Add square' }).click()
current = await state()
assert.equal(current.tiles.length, 2)
const secondId = current.selectedId
assert.notEqual(secondId, firstId)
const first = current.tiles.find((tile) => tile.id === firstId)
await dragSquareTo(secondId, first.x + 3, first.y)
assert.ok(Math.abs((await state()).tiles.find((tile) => tile.id === secondId).x - (first.x + 3)) < 0.01)

await dragSquareTo(secondId, first.x + 1.06, first.y + 0.03)
current = await state()
assert.ok(Math.abs(current.tiles.find((tile) => tile.id === secondId).x - (first.x + 1)) < 1e-6,
  'square did not snap to neighbor')
await page.getByRole('button', { name: 'Undo' }).click()
assert.ok(Math.abs((await state()).tiles.find((tile) => tile.id === secondId).x - (first.x + 3)) < 0.01)
await page.getByRole('button', { name: 'Redo' }).click()
const beforeInvalid = (await state()).tiles.find((tile) => tile.id === secondId)
const start = await squareCenter(secondId)
const blocked = await screen(first.x + 0.5, first.y + 0.5)
await page.mouse.move(start.x, start.y)
await page.mouse.down()
await page.mouse.move(blocked.x, blocked.y, { steps: 10 })
await page.screenshot({ path: 'tmp/m3-invalid-drag.png' })
assert.match(await page.locator('#status').textContent(), /occupied/i)
await page.mouse.up()
assert.deepEqual((await state()).tiles.find((tile) => tile.id === secondId), beforeInvalid)
assert.match(await page.locator('#status').textContent(), /returned/i)

await page.getByRole('button', { name: 'Pink' }).click()
assert.equal((await state()).tiles.find((tile) => tile.id === secondId).color, 6)
await page.getByRole('button', { name: 'Undo' }).click()
assert.equal((await state()).tiles.find((tile) => tile.id === secondId).color, 4)
await page.getByRole('button', { name: 'Redo' }).click()
assert.equal((await state()).tiles.find((tile) => tile.id === secondId).color, 6)

await dragSquareTo(secondId, first.x + 3, first.y)
await page.getByRole('button', { name: 'Rotate clockwise 15 degrees' }).click()
assert.equal((await state()).tiles.find((tile) => tile.id === secondId).rotation, 15)
await page.getByRole('button', { name: 'Undo' }).click()
assert.equal((await state()).tiles.find((tile) => tile.id === secondId).rotation, 0)
await page.keyboard.press('r')
assert.equal((await state()).tiles.find((tile) => tile.id === secondId).rotation, 15)
await page.keyboard.press('Shift+r')
assert.equal((await state()).tiles.find((tile) => tile.id === secondId).rotation, 0)

await page.getByRole('button', { name: 'Duplicate selected tile' }).click()
current = await state()
assert.equal(current.tiles.length, 3)
const duplicateId = current.selectedId
await page.keyboard.press('Control+z')
assert.equal((await state()).tiles.length, 2)
await page.keyboard.press('Control+Shift+z')
assert.equal((await state()).tiles.length, 3)
const duplicate = (await state()).tiles.find((tile) => tile.id === duplicateId)
const duplicatePoint = await screen(duplicate.x + 0.5, duplicate.y + 0.5)
await page.mouse.click(duplicatePoint.x, duplicatePoint.y)
await page.getByRole('button', { name: 'Delete selected tile' }).click()
assert.equal((await state()).tiles.length, 2)
await page.getByRole('button', { name: 'Undo' }).click()
assert.ok((await state()).tiles.some((tile) => tile.id === duplicateId))

const cdp = await page.context().newCDPSession(page)
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type,
  touchPoints: points.map(([x, y], id) => ({ x, y, id })) })
const beforeTouch = (await state()).tiles.find((tile) => tile.id === firstId)
const touchStart = await squareCenter(firstId)
const touchEnd = await screen(first.x - 2 + 0.5, first.y - 1 + 0.5)
await touch('touchStart', [[touchStart.x, touchStart.y]])
await touch('touchMove', [[touchEnd.x, touchEnd.y]])
await touch('touchEnd', [])
const afterTouch = (await state()).tiles.find((tile) => tile.id === firstId)
assert.ok(Math.abs(afterTouch.x - beforeTouch.x) > 1, 'single-touch drag did not move tile')

const rectangleButton = await page.getByRole('button', { name: 'Add rectangle' }).boundingBox()
await page.touchscreen.tap(rectangleButton.x + rectangleButton.width / 2,
  rectangleButton.y + rectangleButton.height / 2)
assert.equal((await state()).tiles.length, 4)
current = await state()
assert.equal(current.tiles.find((tile) => tile.id === current.selectedId).shape, 'rectangle')
const greenButton = await page.getByRole('button', { name: 'Green' }).boundingBox()
await page.touchscreen.tap(greenButton.x + greenButton.width / 2,
  greenButton.y + greenButton.height / 2)
current = await state()
assert.equal(current.tiles.find((tile) => tile.id === current.selectedId).color, 3)
const touchSelectedId = current.selectedId
const rotateButton = await page.getByRole('button', { name: 'Rotate clockwise 15 degrees' }).boundingBox()
await page.touchscreen.tap(rotateButton.x + rotateButton.width / 2,
  rotateButton.y + rotateButton.height / 2)
assert.equal((await state()).tiles.find((tile) => tile.id === touchSelectedId).rotation, 15)
const touchUndo = await page.getByRole('button', { name: 'Undo' }).boundingBox()
await page.touchscreen.tap(touchUndo.x + touchUndo.width / 2, touchUndo.y + touchUndo.height / 2)
assert.equal((await state()).tiles.find((tile) => tile.id === touchSelectedId).rotation, 0)

const beforeTouchPan = await page.evaluate(() => window.__tileToyEditor.renderer.camera.center)
await touch('touchStart', [[1050, 540]])
await touch('touchMove', [[1100, 570]])
await touch('touchEnd', [])
const afterTouchPan = await page.evaluate(() => window.__tileToyEditor.renderer.camera.center)
assert.ok(afterTouchPan.x < beforeTouchPan.x && afterTouchPan.y > beforeTouchPan.y)
const beforePinch = await page.evaluate(() => window.__tileToyEditor.renderer.camera.visibleHeight)
await touch('touchStart', [[450, 580], [700, 580]])
await touch('touchMove', [[400, 580], [750, 580]])
await touch('touchEnd', [])
assert.ok(await page.evaluate(() => window.__tileToyEditor.renderer.camera.visibleHeight) < beforePinch)
await cdp.detach()

const beforeWheel = await page.evaluate(() => window.__tileToyEditor.renderer.camera.visibleHeight)
await page.mouse.move(500, 400)
await page.mouse.wheel(0, -120)
assert.ok(await page.evaluate(() => window.__tileToyEditor.renderer.camera.visibleHeight) < beforeWheel)

const beforePan = await page.evaluate(() => window.__tileToyEditor.renderer.camera.center)
await drag({ x: 900, y: 500 }, { x: 960, y: 530 })
const afterPan = await page.evaluate(() => window.__tileToyEditor.renderer.camera.center)
assert.ok(afterPan.x < beforePan.x && afterPan.y > beforePan.y)
await page.screenshot({ path: 'tmp/m3-workspace.png' })
await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const tray = await page.locator('.palette-tray').boundingBox()
assert.ok(tray.y >= 0 && tray.y + tray.height <= 844, 'mobile palette is outside viewport')
await page.screenshot({ path: 'tmp/m3-mobile.png' })
assert.deepEqual(errors, [])
console.log(JSON.stringify({ spawn: true, select: true, snap: true, invalidRevert: true,
  rotate: true, recolor: true, duplicate: true, delete: true, undoRedo: true,
  mousePan: true, wheelZoom: true, touchTap: true, touchDrag: true,
  touchPalette: true, touchPan: true, touchPinch: true, screenshots: 'tmp/m3-*.png' }, null, 2))
await browser.close()
