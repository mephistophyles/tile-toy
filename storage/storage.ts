import type { Scene, StampLibrary } from '../engine/types'

export const WORKSPACE_META_VERSION = 2
export type ToolbarPlacement = 'top' | 'floating'

export type Stored<T> = { id: string; value: T }

export interface Storage<T> {
  list(): Promise<Stored<T>[]>
  load(id: string): Promise<T | null>
  save(id: string, value: T): Promise<void>
  delete(id: string): Promise<void>
}

export type WorkspaceMeta = {
  schemaVersion: number
  lastOpenedSceneId: string | null
  activeColor: number
  toolbarPlacement: ToolbarPlacement
}

export const emptyWorkspaceMeta = (): WorkspaceMeta => ({
  schemaVersion: WORKSPACE_META_VERSION, lastOpenedSceneId: null,
  activeColor: 0, toolbarPlacement: 'top',
})

export interface TileToyStorage {
  scenes: Storage<Scene>
  stamps: Storage<StampLibrary>
  meta: Storage<WorkspaceMeta>
}
