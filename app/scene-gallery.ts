import type { Scene } from '../engine/types'
import type { Stored } from '../storage/storage'

type GalleryActions = { open: (id: string) => Promise<void>; delete: (id: string) => Promise<void> }

export class SceneGallery {
  private readonly dialog = document.querySelector<HTMLDialogElement>('#gallery-dialog')!
  private readonly list = document.querySelector<HTMLElement>('#gallery-list')!

  constructor(private readonly actions: GalleryActions) {
    this.dialog.querySelector<HTMLButtonElement>('#close-gallery')!
      .addEventListener('click', () => this.close())
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.close()
    })
  }

  show(scenes: Stored<Scene>[]): void {
    this.render(scenes)
    if (!this.dialog.open) this.dialog.showModal()
  }

  render(scenes: Stored<Scene>[]): void {
    this.list.replaceChildren()
    if (!scenes.length) {
      const empty = document.createElement('p')
      empty.className = 'gallery-empty'
      empty.textContent = 'No saved scenes yet. Build something, then choose Save scene from the menu.'
      this.list.append(empty)
      return
    }
    for (const scene of scenes) this.list.append(this.row(scene))
  }

  close(): void { if (this.dialog.open) this.dialog.close() }

  private row({ id, value }: Stored<Scene>): HTMLElement {
    const name = value.metadata.name || 'Untitled'
    const row = document.createElement('article')
    row.className = 'gallery-row'
    const details = document.createElement('div')
    details.className = 'gallery-details'
    const heading = document.createElement('strong')
    heading.textContent = name
    const timestamp = document.createElement('small')
    const date = value.metadata.updatedAt
      ? new Date(value.metadata.updatedAt).toLocaleString() : 'Date unavailable'
    timestamp.textContent = `${value.tiles.length} ${value.tiles.length === 1 ? 'tile' : 'tiles'} · ${date}`
    details.append(heading, timestamp)
    const actions = document.createElement('div')
    actions.className = 'gallery-actions'
    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'primary'
    open.textContent = 'Open'
    open.setAttribute('aria-label', `Open ${name}`)
    open.addEventListener('click', () => void this.actions.open(id))
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'gallery-delete'
    remove.textContent = 'Delete'
    remove.setAttribute('aria-label', `Delete ${name}`)
    remove.addEventListener('click', () => void this.actions.delete(id))
    actions.append(open, remove)
    row.append(details, actions)
    return row
  }
}
