# Tile Toy

M1 is a browser-independent TypeScript engine for the Tile Toy PRD. M2 adds the Three.js renderer and orthographic camera. M3 adds tile interaction, selection, commands, and undo/redo. M4 adds connected-assembly stamps and rigid groups. M5 adds local saves, a gallery, and JSON export/import.

## Run checks

```sh
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

## Engine interface

Import from `engine/index.ts`. Scene and stamp documents are plain JSON data with `schemaVersion: 1`. Tile positions use `{x, y, z}` with `z: 0`; tile colors are palette indices and rotations are multiples of 15 degrees.

- `tileVertices`, `polygonEdges`, `tilesOverlap`, and `anyOverlap` provide geometry and SAT collision checks.
- `edgeContact`, `boundaryEdges`, `adjacencyGraph`, and `connectedComponent` provide contact segments and assembly traversal. A positive shared edge segment establishes adjacency; a point touch does not.
- `solveSnap(moving, receiving)` returns a valid candidate or `null`. It translates the moving tiles within the snap tolerance while preserving their current rotation. Rotate commands provide the 15-degree orientation steps. Candidates maximize total boundary contact; displacement breaks ties.
- `nearestFreePlacement` centers a new tile or stamp at a requested point and searches outward if occupied.
- `applyCommand` validates each scene change. `SceneHistory` records up to 100 scene commands and treats group actions as single undo entries. Invalid commands throw and leave history unchanged.
- `createStamp` captures the selected tile's entire connected component, with coordinates relative to its bounding-box center.
- `parseScene` and `parseStampLibrary` default missing fields and ignore unknown fields; their serializers preserve the engine's document data on round-trip.

The engine source imports no browser APIs, Three.js, or runtime packages. `engine/engine.test.ts` covers the PRD's Appendix A snap matrix, document round-trips, and randomized accepted command sequences.

## M2 renderer review

Open `/?m2` on the Vite dev server and use the Shape study and 500 tiles buttons. The scene is serialized to JSON and parsed before rendering. Drag the canvas to pan, wheel or pinch to zoom, and use Fit scene to reset the view. Show ghost cycles through translucent valid and red invalid previews. The renderer uses one instanced fill and one instanced outline draw per shape, so the 500 tile scene uses eight draw calls.

With the dev server running, `npm run test:browser` runs the Chromium visual and interaction check. It requires Chrome or a Chromium executable set in `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; screenshots are written to `tmp/`. The check covers minimum and maximum zoom, mouse and touch pan, wheel and pinch zoom, resize, 500 tiles, and a 120-frame pan sample.

## M3 workspace review

Open `/` on the Vite dev server. Tap a shape in the bottom tray to place it at the viewport center; occupied centers are nudged to free space. Tap a color to set the active color or recolor the selection. Tap a tile to select it, drag it to move and snap it, or use the floating bar to rotate, duplicate, or delete it. Invalid overlap previews turn red and release without changing the scene. Drag empty space to pan; wheel or pinch to zoom. `R` and `Shift+R` rotate, and `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z` undo and redo. The active color lasts for the browser session.

With the dev server running, `npm run test:editor` checks mouse and touch interactions, snapping, blocked-drop reversion, command undo/redo, and the mobile layout. Its screenshots are written to `tmp/`. Scene persistence is added in M5.

## M4 groups and stamps review

Select any tile in a connected assembly and choose **Save as stamp**. The library tray shows an automatically generated thumbnail and offers Place, Rename, and Delete. A placed stamp is selected as one group: drag, rotate, recolor, duplicate, and delete affect all its tiles. **Ungroup** makes the tiles independent. **New** clears the current scene while keeping the stamp library available in the editor session. Deleting a library stamp leaves copies already placed in scenes intact.

With the dev server running, `npm run test:stamps` checks the six-triangle hexagon flow, including group movement, 90° rotation, snapping a square to its exposed boundary, ungroup, library management, and desktop/mobile screenshots in `tmp/`.

## M5 persistence review

Use **Menu → Save scene** to name and save the canvas. **Open scene** shows the local gallery, where saves can be opened or deleted. **New scene** clears the canvas while keeping saved scenes and stamps. The scene title shows “Unsaved changes” when the canvas differs from its last save, and New, Open, and Import ask before discarding those changes. The last opened save and active color return on reload.

The selected-tile action bar starts pinned at the top of the screen. Choose **Follow tile** on the bar to return it to the selected tile; choose **Pin to top** to move it back. This preference is saved in the versioned workspace metadata and does not mark the scene as changed.

**Export JSON** downloads a self-contained scene document. **Import JSON** opens one on the canvas as an unsaved scene; save it to add a new gallery entry. Placed stamps carry their own tile data, so library deletion does not affect an exported scene. Scenes, the stamp library, and workspace metadata are versioned documents in IndexedDB behind the `Storage<T>` interface in `storage/`.

With the dev server running, `npm run test:persistence` checks save → reload → edit → save → export → import → delete → import, multiple named saves, gallery behavior, stamp persistence, and versioned documents. Screenshots are written to `tmp/m5-*.png`.
