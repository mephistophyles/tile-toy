import { tileVertices } from '../engine/geometry'
import type { Scene } from '../engine/types'
import { EditorWorkspace } from './workspace'
import { SceneGallery } from './scene-gallery'
import type { TileRenderer } from './renderer'

type Callbacks = { announce: (message: string) => void; sceneChanged: () => void;
  libraryChanged: () => void }

const message = (error: unknown): string => error instanceof Error ? error.message : 'An unexpected error occurred.'

export class PersistenceUI {
  private readonly app = document.querySelector<HTMLElement>('#app')!
  private readonly title = document.querySelector<HTMLElement>('#scene-title')!
  private readonly menuButton = document.querySelector<HTMLButtonElement>('#scene-menu-toggle')!
  private readonly menu = document.querySelector<HTMLElement>('#scene-menu')!
  private readonly saveDialog = document.querySelector<HTMLDialogElement>('#save-dialog')!
  private readonly saveName = document.querySelector<HTMLInputElement>('#save-name')!
  private readonly importFile = document.querySelector<HTMLInputElement>('#import-file')!
  private readonly gallery: SceneGallery
  private busy = false

  constructor(private readonly workspace: EditorWorkspace, private readonly renderer: TileRenderer,
    private readonly callbacks: Callbacks) {
    this.gallery = new SceneGallery({
      open: (id) => this.openScene(id), delete: (id) => this.deleteScene(id),
    })
    this.bindMenu()
    this.bindSaveDialog()
    this.importFile.addEventListener('change', () => void this.importSelectedFile())
    window.addEventListener('beforeunload', (event) => {
      if (!this.workspace.dirty) return
      event.preventDefault()
      event.returnValue = ''
    })
  }

  async initialize(): Promise<void> {
    this.app.inert = true
    try {
      await this.workspace.initialize()
      this.callbacks.libraryChanged()
      this.fitScene(this.workspace.model.scene)
      this.callbacks.sceneChanged()
      this.callbacks.announce(this.workspace.currentSceneId
        ? `${this.workspace.model.scene.metadata.name} opened.` : 'Choose a shape to start.')
    } catch (error) {
      this.callbacks.announce(`Could not load local saves: ${message(error)}`)
    } finally {
      this.app.inert = false
      this.sync()
    }
  }

  sync(): void {
    const name = this.workspace.model.scene.metadata.name || 'Untitled'
    this.title.textContent = `${name}${this.workspace.dirty ? ' · Unsaved changes' : ''}`
    this.title.classList.toggle('unsaved', this.workspace.dirty)
    document.title = `${name}${this.workspace.dirty ? ' *' : ''} — Tile Toy`
  }

  async persistLibrary(): Promise<void> {
    try { await this.workspace.persistLibrary() }
    catch (error) { this.callbacks.announce(`Stamp library could not be saved: ${message(error)}`) }
  }

  async persistColor(color: number): Promise<void> {
    try { await this.workspace.setActiveColor(color) }
    catch (error) { this.callbacks.announce(`Color preference could not be saved: ${message(error)}`) }
  }

  private bindMenu(): void {
    this.menuButton.addEventListener('click', () => this.setMenuOpen(this.menu.hidden))
    document.addEventListener('pointerdown', (event) => {
      if (!(event.target instanceof Node) || this.menu.hidden) return
      if (!this.menu.parentElement?.contains(event.target)) this.setMenuOpen(false)
    })
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.setMenuOpen(false)
    })
    document.querySelector('#new-scene')!.addEventListener('click', () => {
      this.setMenuOpen(false)
      if (!this.confirmDiscard()) return
      void this.run(async () => {
        await this.workspace.newScene()
        this.renderer.camera.setView({ x: 0, y: 0 }, 10)
        this.callbacks.sceneChanged()
        this.callbacks.announce('New scene ready. Your saved stamps are available.')
      })
    })
    document.querySelector('#save-scene')!.addEventListener('click', () => {
      this.setMenuOpen(false)
      const name = this.workspace.model.scene.metadata.name
      this.saveName.value = name === 'Untitled' ? '' : name
      this.saveDialog.showModal()
      this.saveName.focus()
      this.saveName.select()
    })
    document.querySelector('#open-scenes')!.addEventListener('click', () => {
      this.setMenuOpen(false)
      void this.run(async () => this.gallery.show(await this.workspace.listScenes()))
    })
    document.querySelector('#export-scene')!.addEventListener('click', () => {
      this.setMenuOpen(false)
      this.exportScene()
    })
    document.querySelector('#import-scene')!.addEventListener('click', () => {
      this.setMenuOpen(false)
      this.importFile.click()
    })
  }

  private bindSaveDialog(): void {
    document.querySelector('#cancel-save')!.addEventListener('click', () => this.saveDialog.close())
    document.querySelector<HTMLFormElement>('#save-form')!.addEventListener('submit', (event) => {
      event.preventDefault()
      void this.run(async () => {
        await this.workspace.saveScene(this.saveName.value)
        this.saveDialog.close()
        this.callbacks.sceneChanged()
        this.callbacks.announce(`${this.workspace.model.scene.metadata.name} saved.`)
      })
    })
  }

  private setMenuOpen(open: boolean): void {
    this.menu.hidden = !open
    this.menuButton.setAttribute('aria-expanded', String(open))
  }

  private confirmDiscard(): boolean {
    return !this.workspace.dirty || window.confirm('Discard unsaved changes to this scene?')
  }

  private async openScene(id: string): Promise<void> {
    if (!this.confirmDiscard()) return
    await this.run(async () => {
      await this.workspace.openScene(id)
      this.gallery.close()
      this.fitScene(this.workspace.model.scene)
      this.callbacks.sceneChanged()
      this.callbacks.announce(`${this.workspace.model.scene.metadata.name} opened.`)
    })
  }

  private async deleteScene(id: string): Promise<void> {
    await this.run(async () => {
      const scene = (await this.workspace.listScenes()).find((item) => item.id === id)
      if (!scene || !window.confirm(`Delete “${scene.value.metadata.name}” from local saves?`)) return
      await this.workspace.deleteScene(id)
      this.gallery.render(await this.workspace.listScenes())
      this.sync()
      this.callbacks.announce('Saved scene deleted. The current canvas stays open.')
    })
  }

  private async importSelectedFile(): Promise<void> {
    const file = this.importFile.files?.[0]
    this.importFile.value = ''
    if (!file || !this.confirmDiscard()) return
    await this.run(async () => {
      await this.workspace.importScene(await file.text())
      this.fitScene(this.workspace.model.scene)
      this.callbacks.sceneChanged()
      this.callbacks.announce(`${this.workspace.model.scene.metadata.name} imported. Save it to keep it locally.`)
    })
  }

  private exportScene(): void {
    const name = this.workspace.model.scene.metadata.name || 'Untitled'
    const filename = `${name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'Untitled'}.json`
    const url = URL.createObjectURL(new Blob([this.workspace.exportScene()], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    this.callbacks.announce(`${name} exported as JSON.`)
  }

  private fitScene(scene: Scene): void {
    if (!scene.tiles.length) { this.renderer.camera.setView({ x: 0, y: 0 }, 10); return }
    const points = scene.tiles.flatMap(tileVertices)
    this.renderer.camera.fitBounds({ x: Math.min(...points.map((point) => point.x)),
      y: Math.min(...points.map((point) => point.y)) },
    { x: Math.max(...points.map((point) => point.x)), y: Math.max(...points.map((point) => point.y)) })
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.app.inert = true
    try { await action() }
    catch (error) { this.callbacks.announce(message(error)) }
    finally {
      this.busy = false
      this.app.inert = false
      this.sync()
    }
  }
}
