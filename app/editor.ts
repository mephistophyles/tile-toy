import { tileVertices } from '../engine/geometry'
import type { Point, Shape } from '../engine/types'
import { IndexedDBTileToyStorage } from '../storage/indexeddb'
import { EditorModel } from './editor-model'
import { colorNames, renderEditorShell, shapeButtons } from './editor-shell'
import { CanvasInput } from './input'
import { LibraryTray } from './library-tray'
import { PersistenceUI } from './persistence-ui'
import { TileRenderer } from './renderer'
import { EditorWorkspace } from './workspace'
import './editor.css'

const app = document.querySelector<HTMLElement>('#app')!
renderEditorShell(app)
app.inert = true

const host = document.querySelector<HTMLElement>('#canvas-host')!
const renderer = new TileRenderer(host)
const model = new EditorModel()
const workspace = new EditorWorkspace(model, new IndexedDBTileToyStorage())
const status = document.querySelector<HTMLElement>('#status')!
const context = document.querySelector<HTMLElement>('#selection-tools')!
const undoButton = document.querySelector<HTMLButtonElement>('#undo')!
const redoButton = document.querySelector<HTMLButtonElement>('#redo')!
const ungroupButton = document.querySelector<HTMLButtonElement>('#ungroup')!
const placementButton = document.querySelector<HTMLButtonElement>('#toggle-toolbar-placement')!
let persistence: PersistenceUI

const announce = (message: string): void => { status.textContent = message }

const library = new LibraryTray({
  place: (stampId) => {
    if (!model.placeStamp(stampId, renderer.camera.center)) return
    sceneChanged()
    library.setOpen(false)
    announce('Stamp placed. Drag or rotate the whole group.')
  },
  rename: (stampId, name) => {
    const renamed = model.renameStamp(stampId, name)
    if (renamed) { library.show(model.library.stamps); void persistence.persistLibrary(); announce('Stamp renamed.') }
    return renamed
  },
  delete: (stampId) => {
    const stamp = model.library.stamps.find((item) => item.id === stampId)
    if (!stamp || !window.confirm(`Delete “${stamp.name}” from the library? Placed copies will stay in the scene.`)) return
    model.deleteStamp(stampId)
    library.show(model.library.stamps)
    void persistence.persistLibrary()
    announce('Stamp deleted from library.')
  },
})

const positionContext = (): void => {
  const tiles = model.selectedTiles
  if (!tiles.length) { context.hidden = true; return }
  if (workspace.toolbarPlacement === 'top') {
    context.style.removeProperty('left')
    context.style.removeProperty('top')
    context.classList.remove('below')
    return
  }
  const points = tiles.flatMap(tileVertices)
  const top = Math.max(...points.map((point) => point.y))
  const centerX = (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2
  const anchor = renderer.camera.worldToScreen({ x: centerX, y: top })
  const width = context.offsetWidth || 320
  context.style.left = `${Math.max(width / 2 + 12, Math.min(host.clientWidth - width / 2 - 12, anchor.x))}px`
  context.style.top = `${anchor.y < 116 ? anchor.y + 76 : anchor.y - 12}px`
  context.classList.toggle('below', anchor.y < 116)
}

const syncUI = (): void => {
  renderer.setSelection(model.selectedTiles)
  context.hidden = !model.selectedTiles.length
  const pinned = workspace.toolbarPlacement === 'top'
  context.classList.toggle('pinned', pinned)
  placementButton.textContent = pinned ? 'Follow tile' : 'Pin to top'
  placementButton.setAttribute('aria-pressed', String(pinned))
  placementButton.title = pinned ? 'Let actions follow selection' : 'Pin actions to top'
  ungroupButton.hidden = !model.selectedTiles[0]?.groupId
  undoButton.disabled = !model.history.canUndo
  redoButton.disabled = !model.history.canRedo
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-color]')) {
    const active = Number(button.dataset.color) === model.activeColor
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  }
  persistence.sync()
  positionContext()
}

const sceneChanged = (): void => {
  renderer.setScene(model.scene)
  renderer.setGhost(null)
  syncUI()
}

persistence = new PersistenceUI(workspace, renderer, {
  announce, sceneChanged, libraryChanged: () => library.show(model.library.stamps),
})
placementButton.addEventListener('click', () => {
  const next = workspace.toolbarPlacement === 'top' ? 'floating' : 'top'
  void workspace.setToolbarPlacement(next).then(
    () => announce(next === 'top' ? 'Actions pinned to the top.' : 'Actions follow the selected tile.'),
    () => announce('Toolbar position changed, but the preference could not be saved.'),
  )
  syncUI()
})
document.querySelector('#save-stamp')!.addEventListener('click', () => {
  const stamp = model.saveSelectionAsStamp()
  if (!stamp) return
  library.show(model.library.stamps)
  library.setOpen(true)
  void persistence.persistLibrary()
  announce(`${stamp.name} saved from ${stamp.tiles.length} ${stamp.tiles.length === 1 ? 'tile' : 'connected tiles'}.`)
})
ungroupButton.addEventListener('click', () => {
  if (model.ungroup()) { sceneChanged(); announce('Group separated into independent tiles.') }
})

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-shape]')) {
  button.addEventListener('click', () => {
    const shape = button.dataset.shape as Shape
    model.spawn(shape, renderer.camera.center)
    sceneChanged()
    announce(`${shapeButtons.find((item) => item.shape === shape)!.label} added.`)
  })
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-color]')) {
  button.addEventListener('click', () => {
    const color = Number(button.dataset.color)
    const recolored = model.recolor(color)
    void persistence.persistColor(color)
    if (recolored) sceneChanged()
    else syncUI()
    announce(recolored ? `Selection colored ${colorNames[color]!.toLowerCase()}.`
      : `${colorNames[color]} selected for new tiles.`)
  })
}

const rotate = (steps: number): void => {
  if (!model.selectedId) return
  if (model.rotate(steps)) { sceneChanged(); announce(`Rotated ${steps > 0 ? '+' : '−'}15°.`) }
  else announce('That rotation would overlap another tile.')
}
document.querySelector('#rotate-left')!.addEventListener('click', () => rotate(-1))
document.querySelector('#rotate-right')!.addEventListener('click', () => rotate(1))
document.querySelector('#duplicate')!.addEventListener('click', () => {
  if (model.duplicate()) { sceneChanged(); announce('Selection duplicated.') }
})
document.querySelector('#delete')!.addEventListener('click', () => {
  if (model.delete()) { sceneChanged(); announce('Selection deleted.') }
})
undoButton.addEventListener('click', () => {
  if (model.undo()) { sceneChanged(); announce('Undone.') }
})
redoButton.addEventListener('click', () => {
  if (model.redo()) { sceneChanged(); announce('Redone.') }
})

const input = new CanvasInput(renderer.canvas, renderer.camera, {
  press: (point: Point) => {
    const hit = model.selectAt(point)
    syncUI()
    if (!hit) announce('Selection cleared.')
    return Boolean(hit)
  },
  drag: (delta: Point) => {
    const preview = model.previewMove(delta)
    renderer.setGhost(preview?.tiles ?? null, preview?.valid ?? true)
    announce(preview?.valid ? preview.snapped ? 'Release to snap.' : 'Release to place.'
      : 'That spot is occupied. Release to return.')
  },
  release: (delta: Point) => {
    if (model.move(delta)) { sceneChanged(); announce('Selection moved.') }
    else { renderer.setGhost(null); announce('Selection returned to its previous position.') }
  },
  cancel: () => { renderer.setGhost(null); announce('Move cancelled.') },
  viewChanged: () => { renderer.requestRender(); positionContext() },
})

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  const key = event.key.toLowerCase()
  if ((event.metaKey || event.ctrlKey) && key === 'z') {
    event.preventDefault()
    if (event.shiftKey ? model.redo() : model.undo()) {
      sceneChanged(); announce(event.shiftKey ? 'Redone.' : 'Undone.')
    }
  } else if (!event.metaKey && !event.ctrlKey && key === 'r') {
    event.preventDefault(); rotate(event.shiftKey ? -1 : 1)
  } else if (key === 'delete' || key === 'backspace') {
    if (model.delete()) { event.preventDefault(); sceneChanged(); announce('Selection deleted.') }
  } else if (key === 'escape') {
    model.select(null); syncUI(); announce('Selection cleared.')
  }
})

new ResizeObserver(() => {
  renderer.resize(host.clientWidth, host.clientHeight)
  positionContext()
}).observe(host)
sceneChanged()
library.show(model.library.stamps)

const ready = persistence.initialize()
if (import.meta.env.DEV) Object.assign(window, { __tileToyEditor: { renderer, model, input, sceneChanged, workspace, ready } })
