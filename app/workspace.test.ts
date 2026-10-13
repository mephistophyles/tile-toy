import { describe, expect, test } from 'vitest'
import { emptyScene } from '../engine/serialization'
import type { Scene, StampLibrary } from '../engine/types'
import type { Storage, Stored, TileToyStorage, WorkspaceMeta } from '../storage/storage'
import { EditorModel } from './editor-model'
import { EditorWorkspace } from './workspace'

class MemoryCollection<T> implements Storage<T> {
  private readonly values = new Map<string, T>()
  async list(): Promise<Stored<T>[]> {
    return [...this.values].map(([id, value]) => ({ id, value: structuredClone(value) }))
  }
  async load(id: string): Promise<T | null> {
    return structuredClone(this.values.get(id) ?? null)
  }
  async save(id: string, value: T): Promise<void> { this.values.set(id, structuredClone(value)) }
  async delete(id: string): Promise<void> { this.values.delete(id) }
}

const memoryStorage = (): TileToyStorage => ({
  scenes: new MemoryCollection<Scene>(), stamps: new MemoryCollection<StampLibrary>(),
  meta: new MemoryCollection<WorkspaceMeta>(),
})

describe('workspace persistence contract', () => {
  test('save, reload, edit, import and delete keep scene and library documents intact', async () => {
    const storage = memoryStorage()
    let id = 0
    let now = 1000
    const createWorkspace = () => new EditorWorkspace(
      new EditorModel(emptyScene(), () => `tile-${++id}`), storage,
      () => `scene-${++id}`, () => ++now)
    const first = createWorkspace()
    await first.initialize()
    first.model.spawn('square', { x: 0, y: 0 })
    const stamp = first.model.saveSelectionAsStamp()!
    await first.persistLibrary()
    const originalId = await first.saveScene('Castle')
    expect(first.dirty).toBe(false)
    expect(first.model.scene.schemaVersion).toBe(1)
    first.model.rotate(1)
    expect(first.dirty).toBe(true)
    first.model.undo()
    expect(first.dirty).toBe(false)

    const reloaded = createWorkspace()
    await reloaded.initialize()
    expect(reloaded.currentSceneId).toBe(originalId)
    expect(reloaded.model.library.stamps).toEqual([stamp])
    expect(reloaded.model.scene).toEqual(first.model.scene)
    reloaded.model.select(reloaded.model.scene.tiles[0]!.id)
    reloaded.model.rotate(1)
    await reloaded.saveScene('Castle')
    const exported = reloaded.exportScene()
    expect(JSON.parse(exported).tiles[0].rotation).toBe(15)

    await reloaded.importScene(exported)
    expect(reloaded.currentSceneId).toBeNull()
    expect(reloaded.dirty).toBe(true)
    expect(reloaded.exportScene()).toBe(exported)
    await reloaded.deleteScene(originalId)
    expect(await reloaded.listScenes()).toHaveLength(0)
    expect(reloaded.exportScene()).toBe(exported)
    await reloaded.importScene(exported)
    expect(reloaded.exportScene()).toBe(exported)
    const importedId = await reloaded.saveScene('Castle Copy')
    expect(importedId).not.toBe(originalId)
    expect((await reloaded.listScenes())[0]!.value.metadata.name).toBe('Castle Copy')
    expect(reloaded.model.library.stamps).toEqual([stamp])
  })

  test('new scenes and color preference survive through the storage interface', async () => {
    const storage = memoryStorage()
    const first = new EditorWorkspace(new EditorModel(), storage)
    await first.initialize()
    await first.setActiveColor(5)
    await first.setToolbarPlacement('floating')
    first.model.activeColor = 5
    await first.saveScene('Empty')
    await first.newScene()
    expect(first.currentSceneId).toBeNull()
    expect(first.dirty).toBe(false)
    const second = new EditorWorkspace(new EditorModel(), storage)
    await second.initialize()
    expect(second.model.activeColor).toBe(5)
    expect(second.toolbarPlacement).toBe('floating')
    expect(second.currentSceneId).toBeNull()
    expect(await second.listScenes()).toHaveLength(1)
  })
})
