import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }),
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('dialog', (dialog) => dialog.accept())
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.evaluate(() => window.__tileToyEditor.ready)
await mkdir('tmp', { recursive: true })

const state = () => page.evaluate(() => {
  const { model, workspace } = window.__tileToyEditor
  return { scene: JSON.parse(workspace.exportScene()), library: model.library,
    sceneId: workspace.currentSceneId, dirty: workspace.dirty, activeColor: model.activeColor }
})
const menu = async (name) => {
  await page.getByRole('button', { name: 'Scene menu' }).click()
  await page.getByRole('menuitem', { name }).click()
}
const save = async (name) => {
  await menu('Save scene')
  await page.getByRole('textbox', { name: 'Scene name' }).fill(name)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForFunction(() => !window.__tileToyEditor.workspace.dirty &&
    Boolean(window.__tileToyEditor.workspace.currentSceneId))
}
const importJson = async (json) => {
  const chooser = page.waitForEvent('filechooser')
  await menu('Import JSON')
  await (await chooser).setFiles({ name: 'castle.json', mimeType: 'application/json',
    buffer: Buffer.from(json) })
  await page.waitForFunction(() => window.__tileToyEditor.workspace.dirty &&
    window.__tileToyEditor.workspace.currentSceneId === null)
}

await page.getByRole('button', { name: 'Blue' }).click()
await page.getByRole('button', { name: 'Add square' }).click()
await page.getByRole('button', { name: 'Save as stamp' }).click()
await page.getByRole('button', { name: 'Scene menu' }).click()
await page.getByRole('menuitem', { name: 'New scene' }).click()
await page.waitForFunction(() => window.__tileToyEditor.model.scene.tiles.length === 0)
await page.getByRole('button', { name: 'Place Stamp 1' }).click()
assert.equal((await state()).scene.groups.length, 1)
await save('Castle')
const firstId = (await state()).sceneId
await page.screenshot({ path: 'tmp/m5-saved.png' })

await page.reload({ waitUntil: 'networkidle' })
await page.evaluate(() => window.__tileToyEditor.ready)
let current = await state()
assert.equal(current.sceneId, firstId)
assert.equal(current.scene.metadata.name, 'Castle')
assert.equal(current.scene.tiles.length, 1)
assert.equal(current.library.stamps.length, 1)
assert.equal(current.library.stamps[0].tiles.length, 1)
assert.equal(current.activeColor, 4)
assert.equal(current.dirty, false)

const squareCenter = await page.evaluate(() => {
  const { model, renderer } = window.__tileToyEditor
  const tile = model.scene.tiles[0]
  return renderer.camera.worldToScreen({ x: tile.x + 0.5, y: tile.y + 0.5 })
})
await page.mouse.click(squareCenter.x, squareCenter.y)
await page.getByRole('button', { name: 'Rotate clockwise 15 degrees' }).click()
assert.equal((await state()).scene.tiles[0].rotation, 15)
assert.equal((await state()).dirty, true)
await save('Castle')

const downloadPromise = page.waitForEvent('download')
await menu('Export JSON')
const download = await downloadPromise
assert.equal(download.suggestedFilename(), 'Castle.json')
const exported = await readFile(await download.path(), 'utf8')
const exportedScene = JSON.parse(exported)
assert.equal(exportedScene.schemaVersion, 1)
assert.equal(exportedScene.tiles[0].rotation, 15)
assert.equal(exportedScene.groups.length, 1)
assert.equal(exportedScene.groups[0].stampId, current.library.stamps[0].id)

await importJson(exported)
assert.deepEqual((await state()).scene, exportedScene)
await menu('Open scene')
await page.getByRole('button', { name: 'Delete Castle' }).click()
await page.waitForFunction(() => Boolean(document.querySelector('.gallery-empty')))
assert.deepEqual((await state()).scene, exportedScene)
await page.getByRole('button', { name: 'Close saved scenes' }).click()
await importJson(exported)
assert.deepEqual((await state()).scene, exportedScene)
await save('Castle Copy')
assert.notEqual((await state()).sceneId, firstId)

await menu('New scene')
await page.waitForFunction(() => window.__tileToyEditor.workspace.currentSceneId === null)
await save('Second')
await menu('Open scene')
await page.locator('.gallery-row').first().waitFor()
assert.equal(await page.locator('.gallery-row').count(), 2)
await page.screenshot({ path: 'tmp/m5-gallery.png' })
await page.getByRole('button', { name: 'Open Castle Copy' }).click()
await page.waitForFunction(() => window.__tileToyEditor.model.scene.metadata.name === 'Castle Copy')
assert.equal((await state()).scene.tiles.length, 1)

const databaseDocuments = await page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('tile-toy')
  request.onerror = () => reject(request.error)
  request.onsuccess = () => {
    const db = request.result
    const transaction = db.transaction(['stamps', 'meta'], 'readonly')
    const stamp = transaction.objectStore('stamps').get('library')
    const meta = transaction.objectStore('meta').get('workspace')
    transaction.oncomplete = () => resolve({ stamp: JSON.parse(stamp.result),
      meta: JSON.parse(meta.result) })
    transaction.onerror = () => reject(transaction.error)
  }
}))
assert.equal(databaseDocuments.stamp.schemaVersion, 1)
assert.equal(databaseDocuments.meta.schemaVersion, 2)
assert.equal(databaseDocuments.stamp.stamps.length, 1)

await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
await page.screenshot({ path: 'tmp/m5-mobile.png' })
assert.deepEqual(errors, [])
console.log(JSON.stringify({ save: true, reload: true, editAndSave: true, exportImport: true,
  deleteAndReimport: true, multipleScenes: true, gallery: true, stampsPersist: true,
  versionedDocuments: true, screenshots: 'tmp/m5-*.png' }, null, 2))
await browser.close()
