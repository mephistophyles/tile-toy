import { validateScene } from '../engine/commands'
import { parseScene, serializeScene } from '../engine/serialization'
import type { Scene, StampLibrary } from '../engine/types'
import { emptyWorkspaceMeta, type Stored, type TileToyStorage, type ToolbarPlacement, type WorkspaceMeta } from '../storage/storage'
import { EditorModel } from './editor-model'

const STAMP_LIBRARY_ID = 'library'
const WORKSPACE_META_ID = 'workspace'

export class EditorWorkspace {
  private sceneId: string | null = null
  private savedSnapshot: string
  private imported = false
  private meta: WorkspaceMeta = emptyWorkspaceMeta()
  private libraryWrite: Promise<void> = Promise.resolve()
  private metaWrite: Promise<void> = Promise.resolve()

  constructor(readonly model: EditorModel, private readonly storage: TileToyStorage,
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly now: () => number = Date.now) {
    this.savedSnapshot = serializeScene(model.scene)
  }

  get currentSceneId(): string | null { return this.sceneId }
  get dirty(): boolean { return this.imported || serializeScene(this.model.scene) !== this.savedSnapshot }
  get toolbarPlacement(): ToolbarPlacement { return this.meta.toolbarPlacement }

  async initialize(): Promise<void> {
    const [library, meta] = await Promise.all([
      this.storage.stamps.load(STAMP_LIBRARY_ID), this.storage.meta.load(WORKSPACE_META_ID),
    ])
    if (library) this.model.library = library
    this.meta = meta ?? emptyWorkspaceMeta()
    this.model.activeColor = this.meta.activeColor
    if (!this.meta.lastOpenedSceneId) return
    const scene = await this.storage.scenes.load(this.meta.lastOpenedSceneId)
    if (!scene) {
      this.meta = { ...this.meta, lastOpenedSceneId: null }
      await this.persistMeta()
      return
    }
    validateScene(scene)
    this.model.loadScene(scene)
    this.sceneId = this.meta.lastOpenedSceneId
    this.savedSnapshot = serializeScene(scene)
  }

  async listScenes(): Promise<Stored<Scene>[]> {
    const scenes = await this.storage.scenes.list()
    return scenes.sort((a, b) => b.value.metadata.updatedAt - a.value.metadata.updatedAt)
  }

  async saveScene(name: string): Promise<string> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Give this scene a name before saving.')
    const now = this.now()
    const metadata = { ...this.model.scene.metadata, name: trimmed,
      createdAt: this.model.scene.metadata.createdAt || now, updatedAt: now }
    const savedScene = { ...this.model.scene, metadata }
    const id = this.sceneId ?? this.newId()
    await this.storage.scenes.save(id, savedScene)
    this.model.setMetadata(metadata)
    this.sceneId = id
    this.savedSnapshot = serializeScene(savedScene)
    this.imported = false
    this.meta = { ...this.meta, lastOpenedSceneId: id }
    await this.persistMeta()
    return id
  }

  async openScene(id: string): Promise<void> {
    const scene = await this.storage.scenes.load(id)
    if (!scene) throw new Error('That scene is no longer in the gallery.')
    validateScene(scene)
    this.model.loadScene(scene)
    this.sceneId = id
    this.savedSnapshot = serializeScene(scene)
    this.imported = false
    this.meta = { ...this.meta, lastOpenedSceneId: id }
    await this.persistMeta()
  }

  async newScene(): Promise<void> {
    this.model.newScene()
    this.sceneId = null
    this.savedSnapshot = serializeScene(this.model.scene)
    this.imported = false
    this.meta = { ...this.meta, lastOpenedSceneId: null }
    await this.persistMeta()
  }

  async deleteScene(id: string): Promise<void> {
    await this.storage.scenes.delete(id)
    if (id !== this.sceneId) return
    this.sceneId = null
    this.imported = true
    this.meta = { ...this.meta, lastOpenedSceneId: null }
    await this.persistMeta()
  }

  async importScene(json: string): Promise<void> {
    const scene = parseScene(json)
    validateScene(scene)
    this.model.loadScene(scene)
    this.sceneId = null
    this.imported = true
    this.meta = { ...this.meta, lastOpenedSceneId: null }
    await this.persistMeta()
  }

  exportScene(): string { return serializeScene(this.model.scene) }

  persistLibrary(): Promise<void> {
    const snapshot: StampLibrary = this.model.library
    this.libraryWrite = this.libraryWrite.catch(() => {}).then(() =>
      this.storage.stamps.save(STAMP_LIBRARY_ID, snapshot))
    return this.libraryWrite
  }

  setActiveColor(color: number): Promise<void> {
    this.meta = { ...this.meta, activeColor: color }
    return this.persistMeta()
  }

  setToolbarPlacement(placement: ToolbarPlacement): Promise<void> {
    this.meta = { ...this.meta, toolbarPlacement: placement }
    return this.persistMeta()
  }

  private persistMeta(): Promise<void> {
    const snapshot = this.meta
    this.metaWrite = this.metaWrite.catch(() => {}).then(() =>
      this.storage.meta.save(WORKSPACE_META_ID, snapshot))
    return this.metaWrite
  }
}
