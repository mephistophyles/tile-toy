import type { Stamp } from '../engine/types'
import { stampThumbnail } from './stamp-thumbnail'

type LibraryActions = {
  place: (stampId: string) => void
  rename: (stampId: string, name: string) => boolean
  delete: (stampId: string) => void
}

const button = (label: string, className = ''): HTMLButtonElement => {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = label
  element.className = className
  return element
}

export class LibraryTray {
  private readonly list: HTMLElement
  private readonly toggle: HTMLButtonElement
  private readonly tray: HTMLElement

  constructor(actions: LibraryActions) {
    this.actions = actions
    this.list = document.querySelector<HTMLElement>('#stamp-list')!
    this.toggle = document.querySelector<HTMLButtonElement>('#stamps-toggle')!
    this.tray = document.querySelector<HTMLElement>('#library-tray')!
    this.toggle.addEventListener('click', () => this.setOpen(this.tray.hidden))
    this.tray.querySelector<HTMLButtonElement>('#close-library')!
      .addEventListener('click', () => this.setOpen(false))
  }

  private readonly actions: LibraryActions

  setOpen(open: boolean): void {
    this.tray.hidden = !open
    this.toggle.setAttribute('aria-expanded', String(open))
  }

  show(stamps: Stamp[]): void {
    this.list.replaceChildren()
    if (!stamps.length) {
      const empty = document.createElement('p')
      empty.className = 'library-empty'
      empty.textContent = 'Select an assembly and choose Save as stamp to add it here.'
      this.list.append(empty)
      return
    }
    for (const stamp of stamps) this.list.append(this.card(stamp))
  }

  private card(stamp: Stamp): HTMLElement {
    const card = document.createElement('article')
    card.className = 'stamp-card'
    card.dataset.stampId = stamp.id
    card.append(stampThumbnail(stamp))
    const content = document.createElement('div')
    content.className = 'stamp-card-content'
    const name = document.createElement('strong')
    name.textContent = stamp.name
    const count = document.createElement('small')
    count.textContent = `${stamp.tiles.length} ${stamp.tiles.length === 1 ? 'tile' : 'tiles'}`
    const actions = document.createElement('div')
    actions.className = 'stamp-card-actions'
    const place = button('Place', 'stamp-place')
    place.setAttribute('aria-label', `Place ${stamp.name}`)
    place.addEventListener('click', () => this.actions.place(stamp.id))
    const rename = button('Rename', 'stamp-secondary')
    rename.setAttribute('aria-label', `Rename ${stamp.name}`)
    rename.addEventListener('click', () => this.editName(stamp, name))
    const remove = button('Delete', 'stamp-secondary stamp-delete')
    remove.setAttribute('aria-label', `Delete ${stamp.name}`)
    remove.addEventListener('click', () => this.actions.delete(stamp.id))
    actions.append(place, rename, remove)
    content.append(name, count, actions)
    card.append(content)
    return card
  }

  private editName(stamp: Stamp, name: HTMLElement): void {
    const field = document.createElement('input')
    field.type = 'text'
    field.maxLength = 80
    field.value = stamp.name
    field.setAttribute('aria-label', `New name for ${stamp.name}`)
    name.replaceWith(field)
    field.focus()
    field.select()
    let finished = false
    const finish = (save: boolean): void => {
      if (finished) return
      finished = true
      if (save && this.actions.rename(stamp.id, field.value)) return
      field.replaceWith(name)
    }
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true)
      if (event.key === 'Escape') finish(false)
    })
    field.addEventListener('blur', () => finish(true))
  }
}
