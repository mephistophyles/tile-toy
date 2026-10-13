PRD: Tile Toy (working title) — v1
1. Overview
A browser-based sandbox building game based on connecting tile toys (magnatile-style). Players place colored geometric shapes that snap edge-to-edge, build assemblies, save assemblies as reusable stamps, and persist creations. v1 is strictly 2D but architected so 3D is an extension, not a rewrite.

2. Goals & Non-Goals
v1 goals: Edge-snapping tile placement · 4 shapes, 8 colors · groups & stamp system · local saves with export/import · playable on desktop mouse and tablet touch · clean, minimal UI.

v1 non-goals (explicit): Accounts/cloud sync, share links, rubber-band multi-select, color scheme system (data model must anticipate it — see §3), 3D camera/fold mechanics, visual polish iteration, onboarding/tutorial, telemetry.

3. Load-Bearing Constraints (future-proofing rules)
These are hard constraints on the implementation, chosen to keep future features additive:

3D path: Built on Three.js with an orthographic camera looking down the z-axis at the z=0 plane. Tiles are flat meshes. All positions are {x, y, z} with z always 0 in v1. Picking is raycast against the ground plane. Going 3D later = unlocking the camera and adding fold mechanics on top of the shared-edge adjacency records (§7) — no data migration.
Cloud path: All persistence goes through a Storage interface (list / load / save / delete). IndexedDB is the only v1 implementation. A future cloud adapter implements the same interface.
Color scheme path: Tile colors are stored as palette indices (0–7), never hex values. A future color-scheme feature is an alternate palette table applied at render time. Adding hex to tile data is a spec violation.
Save format versioning: All serialized documents carry an integer schemaVersion. Loaders must be tolerant: unknown fields ignored, missing fields defaulted. Additive changes bump the version.
4. Tech Stack
Language: TypeScript, strict mode.
Engine: Pure, dependency-free package (engine/) — no DOM, no Three.js imports. Contains geometry, snap solver, overlap detection, adjacency graph, serialization, command definitions. Fully unit-testable with Vitest without a browser.
Renderer: Three.js (orthographic camera, flat ShapeGeometry meshes, outline lines).
App/UI: Vite, vanilla TypeScript, no framework. UI chrome is DOM/HTML overlaid on canvas.
Input: Pointer Events (unified mouse/touch). No hover-dependent UI.
5. Shapes
Unit length = 1. Canonical local-space definitions (before transform):

Shape
Canonical vertices
Edge lengths
Interior angles
Square	(0,0),(1,0),(1,1),(0,1)	1 ×4	90°
Equilateral triangle	(0,0),(1,0),(0.5, √3/2)	1 ×3	60°
Right triangle	(0,0),(1,0),(0,1)	1, 1, √2	45°, 45°, 90°
Rectangle	(0,0),(1,0),(1,0.5),(0,0.5)	1, 0.5, 1, 0.5	90°

All shapes are convex polygons — overlap detection is convex-vs-convex (SAT).

6. Core Mechanics
6.1 Snapping
Tiles snap edge-to-edge. There is no background grid and no free-grid quantization; an unsnapped tile sits where dropped (float position; rotation always on the 15° grid, see 6.3).

Contact rules:

A contact is valid when a moving edge is placed collinear with a receiving edge and their segments overlap by at least a minimum contact length (tunable, suggested 0.05–0.1 units — point/corner-touches don't count).
All edge lengths in the set (0.5, 1, √2) can contact each other.
Equal lengths → single flush placement.
Mismatched lengths → the shorter segment gets two alignment modes against the longer one: end-aligned (flush with either endpoint) and midpoint-aligned (centered). This applies in both roles: shorter edge moving onto longer receiving edge, and longer edge moving onto shorter receiving edge.
T-junctions and overhangs are legal. Vertices may meet edge interiors; edges may overhang (e.g., a unit square edge centered on a √2 hypotenuse overhangs ~0.21 per side). Only area overlap is forbidden.
Candidate selection (the snap solver):

Enumerate candidate placements for the moving set (single tile or group boundary) against all receiving boundary edges in the world: for each edge pair, equal-length flush; mismatched → end-aligned (both endpoints) + midpoint-aligned; both edge directions.
Discard candidates whose snap displacement exceeds the snap tolerance (tunable, suggested ~0.15 world units).
Discard candidates causing area overlap with any existing tile (boundary touching is fine, interior intersection is not).
Among remaining candidates, choose the one with maximum total contact length; tiebreak by minimum displacement from pointer. (Consequence: dropping into a corner seats on both edges; dropping near an edge's middle centers a mismatched tile, near its end flushes it — the accepted UX behavior.)
Overlap rejection UX: when the current drag position has no valid candidate, the ghost renders red/translucent; releasing returns the tile to its pre-drag pose.

Spawn: tapping a palette shape spawns the tile at viewport center, auto-selected. If the center is occupied, nudge outward (small spiral search) to the nearest free position.

6.2 Groups & Stamps
Group: a first-class rigid set of tiles. Move, rotate, recolor, duplicate, delete operate on the whole group. Ungroup dissolves it into individual tiles. Tapping any tile of a placed group selects the whole group. New tiles snap to the group's boundary edges only (edges shared between group tiles are not exposed).
Stamp creation ("Save assembly"): available when the selection is a standalone assembly or a group. Scope = the entire connected component of the selected tile (flood-fill over the edge-adjacency graph). Single-tile assemblies are allowed. Creates a stamp definition: id, auto name ("Stamp N", renamable), embedded relative tile list (origin = centroid of the assembly's bounding box, deterministic), auto-generated thumbnail.
Stamp placement: spawns a group instance at viewport center (auto-selected, nudge-to-free on overlap), snaps as a rigid unit, rotates in 15° steps about its origin.
Self-containment: stamp instances in a scene embed a full copy of their tile list (with the source stamp id kept as metadata). Deleting a stamp from the library never breaks existing scenes.
Library: persists locally (IndexedDB), available across all scenes. Managed in the library tray: place, rename, delete.
Rubber-band selection is deferred; connected-component stamping is the v1 mechanism.
6.3 Rotation
Global rotation grid: 15° increments (the union of 45°/60°/90° systems). Every stored rotation is an integer multiple of 15 (degrees). All rotate actions step ±15°.

6.4 Colors
8-color palette, indices 0–7: red, orange, yellow, green, blue, purple, pink, white. Suggested hex defaults (tuning appendix): #E53935, #FB8C00, #FDD835, #43A047, #1E88E5, #8E24AA, #EC407A, #FAFAFA. Behavior: active swatch colors newly spawned tiles; tapping a swatch while a tile/group is selected recolors it (whole group for groups). Last-used color persists per session. Visual style v1: flat fill + darker outline, legible, no polish budget.

7. Data Model
Scene document (self-contained, versioned JSON):

json

{
  "schemaVersion": 1,
  "metadata": { "name": "My Castle", "createdAt": 0, "updatedAt": 0 },
  "tiles": [
    { "id": "t1", "shape": "square|triangle|rightTriangle|rectangle",
      "x": 0, "y": 0, "z": 0, "rotation": 15, "color": 3, "groupId": null }
  ],
  "groups": [
    { "id": "g1", "stampId": "s_abc|null", "name": "Stamp 2" }
  ]
}
Stamp definition document (library):

json

{
  "schemaVersion": 1,
  "stamps": [
    { "id": "s_abc", "name": "Rocket", "createdAt": 0,
      "tiles": [ { "shape": "triangle", "x": 0, "y": 0, "rotation": 0, "color": 4 } ] }
  ]
}
Notes: rotations in degrees, multiples of 15. Positions float; {x, y, z} per constraint §3.1. Group instance tiles embed shape/transform/color fully; stampId is provenance only.

Adjacency graph: maintained by the engine as pairs of tile ids with shared contact segments; powers connected-component stamping and is the future 3D hinge structure. Must handle T-junction contacts (vertex-to-edge-interior).

History: command pattern, ~100 steps, scene-level only (stamp library mutations are not undoable). Commands: Spawn, Move, Rotate, Recolor, Duplicate, Delete, PlaceStamp, Ungroup — composites (Duplicate, Ungroup, Delete-group) are single undo entries.

8. UI / UX Spec
Single screen, canvas-first; all UI floats over the scene.

Bottom palette bar: 4 shape buttons (tap = spawn), divider, 8 color swatches, Stamps button (opens library tray).
Top bar: menu (New / Save / Open / Export / Import) with unsaved-changes indicator + confirm-discard on New/Open; undo/redo buttons.
Floating context bar near selection: rotate −15° / +15°, duplicate, delete; "Save as stamp" when eligible; "Ungroup" on group instances.
Library tray: stamp thumbnails, tap to place; rename/delete per stamp.
Open screen: gallery of named saves (name, timestamp, optional thumbnail).
Input mapping (Pointer Events):

Gesture
Action
Tap palette shape	Spawn at center, auto-selected
Drag tile/group	Move with live ghost + snap; release commits or reverts
Tap tile	Select (whole group if in group)
Tap empty space	Deselect
Drag empty space	Pan camera
Wheel / pinch	Zoom to cursor, clamped range
R / Shift+R	Rotate ±15°
Cmd/Ctrl+Z / Shift+Z	Undo / redo

No hover-dependent interactions; touch targets ≥ 44px; keyboard shortcuts are enhancements only.

9. Persistence
Storage interface (§3.2) over IndexedDB; stores: scenes, stamps, meta (last-opened).
Multiple named saves; manual Save; Export/Import as self-contained .json scene files (round-trip must be lossless).
Optional (add if cheap in M5): a single autosave "recovery" slot written on every committed command.
10. Milestones (sequentially gated — verify acceptance before proceeding)
M1 — Engine package. Geometry, snap solver, overlap (SAT), adjacency, serialization, commands. No DOM/Three imports. Accept: entire Appendix A test matrix passes; serialization round-trip property tests pass; "no-overlap after any accepted command sequence" property test passes.

M2 — Render + camera. Three.js scene from engine JSON; flat meshes with outlines; ghost rendering; ortho camera pan/zoom/resize. Accept: a scripted scene JSON renders correctly at min and max zoom; pan/zoom smooth at 60fps with 500 tiles; works with mouse and touch.

M3 — Core interaction. Input layer; spawn/drag/ghost/snap/commit-or-revert; select, rotate, duplicate, recolor, delete; undo/redo. Accept: full interaction checklist from §8 passes on mouse and single-touch; every invalid drop reverts cleanly; undo of every command type works.

M4 — Groups & stamps. Component-fill, save-as-stamp, library tray, place/move/rotate/ungroup, rigid group snapping on boundary edges, thumbnails. Accept: end-to-end — build six triangles into a hexagon, save as stamp, clear scene, place stamp, rotate 90°, snap a square to its boundary, ungroup, verify all tiles independent and correctly transformed.

M5 — Persistence. Storage interface + IndexedDB; named saves; gallery; export/import. Accept: save → reload → edit → save → export → import → delete → import round-trip preserves everything; stamp library persists across scenes and browsers sessions; schema version present in all documents.

Appendix A — Snap Test Matrix (named unit tests; engine must pass all)
Equal-length flush: square edge ↔ square edge.
Equal-length flush: triangle ↔ triangle.
Equal-length flush: right-triangle hypotenuse ↔ hypotenuse (√2–√2).
Short-on-long, end-aligned: rectangle (0.5) onto square edge, flush each endpoint.
Short-on-long, midpoint-aligned: rectangle centered on square edge.
Long-on-short (roles swapped): square onto rectangle's short edge, both alignments.
Unit edge onto √2 hypotenuse: end-aligned and midpoint-aligned (overhang legal).
Corner contact: tile dropped into a corner seats on both edges (max total contact length wins).
Proximity tiebreak: equal contact length → candidate nearest pointer wins (middle-drop centers, end-drop flushes).
Snap tolerance: within tolerance snaps; beyond, no candidate.
Collinearity: near-miss angle (> tolerance) → no snap.
Minimum contact length: corner/point-touch only → invalid.
Overlap rejection: valid contact but intersects a third tile → invalid, ghost red.
T-junction legality: vertex meets edge interior → valid, recorded in adjacency.
Overhang legality: centered mismatched overhang → valid.
Rotation invariant: every solver output rotation is a multiple of 15°.
Adjacency symmetry: contact graph is consistent in both directions.
Component-fill: fixture with two disconnected assemblies → flood-fill returns exactly one.
Appendix B — Tuning Parameters (implementer's discretion, with suggested defaults)
Snap displacement tolerance (~0.15 units) · minimum contact length (0.05–0.1) · zoom range (~0.2–5 units/screen-height) · history depth (~100) · ghost opacity · palette hex values · background (plain; optional faint dot grid — must not imply grid snapping).
