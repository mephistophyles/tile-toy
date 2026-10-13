import type { Shape } from '../engine/types'
import { PALETTE } from './renderer'

export const shapeButtons: { shape: Shape; label: string; points: string }[] = [
  { shape: 'square', label: 'Square', points: '4,4 28,4 28,28 4,28' },
  { shape: 'triangle', label: 'Equilateral triangle', points: '4,27 28,27 16,5' },
  { shape: 'rightTriangle', label: 'Right triangle', points: '4,27 28,27 4,3' },
  { shape: 'rectangle', label: 'Rectangle', points: '3,9 29,9 29,23 3,23' },
]
export const colorNames = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'White']

export const renderEditorShell = (app: HTMLElement): void => {
  app.innerHTML = `
    <div class="canvas-host" id="canvas-host"></div>
    <header class="editor-topbar">
      <div class="editor-brand"><span class="brand-emblem" aria-hidden="true">▧</span><div><strong>Tile Toy</strong><small id="scene-title">Untitled scene</small></div></div>
      <div class="topbar-actions">
        <div class="menu-wrap">
          <button id="scene-menu-toggle" type="button" aria-haspopup="menu" aria-controls="scene-menu" aria-expanded="false" aria-label="Scene menu">☰ <span>Menu</span></button>
          <div id="scene-menu" class="scene-menu" role="menu" aria-label="Scene actions" hidden>
            <button id="new-scene" role="menuitem" type="button">New scene</button>
            <button id="save-scene" role="menuitem" type="button">Save scene</button>
            <button id="open-scenes" role="menuitem" type="button">Open scene</button>
            <button id="export-scene" role="menuitem" type="button">Export JSON</button>
            <button id="import-scene" role="menuitem" type="button">Import JSON</button>
          </div>
        </div>
        <div class="history-actions" role="group" aria-label="History">
          <button id="undo" type="button" aria-label="Undo" title="Undo (⌘/Ctrl+Z)" disabled><span aria-hidden="true">↶</span><span>Undo</span></button>
          <button id="redo" type="button" aria-label="Redo" title="Redo (⌘/Ctrl+Shift+Z)" disabled><span aria-hidden="true">↷</span><span>Redo</span></button>
        </div>
      </div>
    </header>
    <div id="selection-tools" class="selection-tools" role="toolbar" aria-label="Selected tile actions" hidden>
      <button id="toggle-toolbar-placement" type="button" class="placement-toggle" aria-label="Pin actions to top" aria-pressed="true" title="Let actions follow selection">Follow tile</button>
      <span class="tool-divider" aria-hidden="true"></span>
      <button id="rotate-left" type="button" aria-label="Rotate counterclockwise 15 degrees" title="Rotate −15° (Shift+R)">↶ 15°</button>
      <button id="rotate-right" type="button" aria-label="Rotate clockwise 15 degrees" title="Rotate +15° (R)">↷ 15°</button>
      <span class="tool-divider" aria-hidden="true"></span>
      <button id="duplicate" type="button" aria-label="Duplicate selected tile">Duplicate</button>
      <button id="save-stamp" type="button" aria-label="Save as stamp">Save as stamp</button>
      <button id="ungroup" type="button" aria-label="Ungroup selected stamp" hidden>Ungroup</button>
      <button id="delete" type="button" class="danger" aria-label="Delete selected tile">Delete</button>
    </div>
    <p id="status" class="editor-status" role="status" aria-live="polite">Loading your workspace…</p>
    <footer class="palette-tray" aria-label="Tile palette">
      <div class="shape-tools" role="group" aria-label="Shapes">
        ${shapeButtons.map(({ shape, label, points }) => `<button type="button" data-shape="${shape}" aria-label="Add ${label.toLowerCase()}" title="Add ${label}"><svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="${points}" /></svg></button>`).join('')}
      </div>
      <span class="tray-divider" aria-hidden="true"></span>
      <div class="color-tools" role="group" aria-label="Colors">
        ${PALETTE.map((hex, index) => `<button type="button" data-color="${index}" aria-label="${colorNames[index]}" title="${colorNames[index]}" style="--swatch:${hex}"><span></span></button>`).join('')}
      </div>
      <span class="tray-divider" aria-hidden="true"></span>
      <button id="stamps-toggle" class="stamps-toggle" type="button" aria-controls="library-tray" aria-expanded="false">Stamps</button>
    </footer>
    <aside id="library-tray" class="library-tray" aria-label="Stamp library" hidden>
      <div class="library-heading"><div><strong>Stamps</strong><small>Reusable assemblies</small></div><button id="close-library" type="button" aria-label="Close stamp library">×</button></div>
      <div id="stamp-list" class="stamp-list"></div>
    </aside>
    <dialog id="save-dialog" class="editor-dialog" aria-labelledby="save-heading">
      <form id="save-form"><h2 id="save-heading">Save scene</h2><label for="save-name">Scene name</label><input id="save-name" name="name" type="text" required maxlength="80" autocomplete="off" />
        <div class="dialog-actions"><button id="cancel-save" type="button">Cancel</button><button type="submit" class="primary">Save</button></div>
      </form>
    </dialog>
    <dialog id="gallery-dialog" class="editor-dialog gallery-dialog" aria-labelledby="gallery-heading">
      <div class="gallery-heading"><div><h2 id="gallery-heading">Saved scenes</h2><p>Open or delete a local save.</p></div><button id="close-gallery" type="button" aria-label="Close saved scenes">×</button></div>
      <div id="gallery-list" class="gallery-list"></div>
    </dialog>
    <input id="import-file" type="file" accept=".json,application/json" hidden />
  `
}
