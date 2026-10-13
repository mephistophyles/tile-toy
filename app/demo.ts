import { tileVertices } from '../engine/geometry'
import { serializeScene } from '../engine/serialization'
import type { Point, Scene, Tile } from '../engine/types'
import { CameraControls } from './controls'
import { scriptedScene } from './sample'
import { TileRenderer } from './renderer'
import './style.css'

const app = document.querySelector<HTMLElement>('#app')!
app.innerHTML = `
  <div class="canvas-host" id="canvas-host"></div>
  <header class="masthead" aria-label="Renderer study controls">
    <div class="brand"><span class="brand-mark" aria-hidden="true">▧</span><div><strong>Tile Toy</strong><small>Renderer study · M2</small></div></div>
    <div class="controls">
      <div class="segmented" role="group" aria-label="Scene">
        <button id="sample" class="active" type="button">Shape study</button>
        <button id="stress" type="button">500 tiles</button>
      </div>
      <button id="ghost" type="button">Show ghost</button>
      <button id="fit" type="button">Fit scene</button>
    </div>
  </header>
  <div class="bottom-bar"><span id="status">Loading scene…</span><span class="instruction">Drag to pan · Wheel or pinch to zoom</span></div>
`

const host = document.querySelector<HTMLElement>('#canvas-host')!
const renderer = new TileRenderer(host)
const controls = new CameraControls(renderer.canvas, renderer.camera, renderer.requestRender)
const status = document.querySelector<HTMLElement>('#status')!
const sampleButton = document.querySelector<HTMLButtonElement>('#sample')!
const stressButton = document.querySelector<HTMLButtonElement>('#stress')!
const ghostButton = document.querySelector<HTMLButtonElement>('#ghost')!
let currentScene = scriptedScene()
let ghostMode: 'off' | 'valid' | 'invalid' = 'off'

const bounds = (scene: Scene): { min: Point; max: Point } => {
  const points = scene.tiles.flatMap(tileVertices)
  return {
    min: { x: Math.min(...points.map((point) => point.x)), y: Math.min(...points.map((point) => point.y)) },
    max: { x: Math.max(...points.map((point) => point.x)), y: Math.max(...points.map((point) => point.y)) },
  }
}

const fit = (): void => {
  const { min, max } = bounds(currentScene)
  renderer.camera.fitBounds(min, max)
  renderer.requestRender()
}

const ghostTile = (): Tile => {
  const first = currentScene.tiles[0]!
  const area = bounds(currentScene)
  return ghostMode === 'valid'
    ? { id: 'demo-ghost', shape: 'triangle', x: area.max.x + 0.25,
      y: (area.min.y + area.max.y) / 2 - 0.4, z: 0, rotation: 0, color: 4, groupId: null }
    : { ...first, id: 'demo-ghost', x: first.x + 0.1, y: first.y + 0.1 }
}

const updateGhost = (): void => {
  renderer.setGhost(ghostMode === 'off' ? null : [ghostTile()], ghostMode === 'valid')
  ghostButton.textContent = ghostMode === 'off' ? 'Show ghost'
    : ghostMode === 'valid' ? 'Ghost: valid' : 'Ghost: invalid'
  ghostButton.setAttribute('aria-pressed', String(ghostMode !== 'off'))
}

const load = (stress: boolean): void => {
  currentScene = scriptedScene(stress)
  renderer.setSceneFromJSON(serializeScene(currentScene))
  sampleButton.classList.toggle('active', !stress)
  stressButton.classList.toggle('active', stress)
  sampleButton.setAttribute('aria-pressed', String(!stress))
  stressButton.setAttribute('aria-pressed', String(stress))
  fit()
  updateGhost()
  requestAnimationFrame(() => {
    status.textContent = `${renderer.tileCount} tiles · ${renderer.drawCalls} draw calls`
  })
}

sampleButton.addEventListener('click', () => load(false))
stressButton.addEventListener('click', () => load(true))
ghostButton.addEventListener('click', () => {
  ghostMode = ghostMode === 'off' ? 'valid' : ghostMode === 'valid' ? 'invalid' : 'off'
  updateGhost()
})
document.querySelector<HTMLButtonElement>('#fit')!.addEventListener('click', fit)
new ResizeObserver(() => renderer.resize(host.clientWidth, host.clientHeight)).observe(host)
load(false)

if (import.meta.env.DEV) {
  Object.assign(window, { __tileToy: { renderer, controls, load, fit } })
}
