import { parseScene, parseStampLibrary, serializeScene, serializeStampLibrary } from '../engine/serialization'
import type { Scene, StampLibrary } from '../engine/types'
import { WORKSPACE_META_VERSION, type Storage, type TileToyStorage, type WorkspaceMeta } from './storage'

type StoreName = 'scenes' | 'stamps' | 'meta'
type Codec<T> = { parse: (json: string) => T; serialize: (value: T) => string }

export const parseWorkspaceMeta = (json: string): WorkspaceMeta => {
  const raw: unknown = JSON.parse(json)
  const value = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {}
  const color = value.activeColor
  return {
    schemaVersion: WORKSPACE_META_VERSION,
    lastOpenedSceneId: typeof value.lastOpenedSceneId === 'string' ? value.lastOpenedSceneId : null,
    activeColor: typeof color === 'number' && Number.isInteger(color) && color >= 0 && color <= 7 ? color : 0,
    toolbarPlacement: value.toolbarPlacement === 'floating' ? 'floating' : 'top',
  }
}

class IndexedDBCollection<T> implements Storage<T> {
  constructor(private readonly open: () => Promise<IDBDatabase>,
    private readonly storeName: StoreName, private readonly codec: Codec<T>) {}

  async list(): Promise<{ id: string; value: T }[]> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const store = tx.objectStore(this.storeName)
      const keys = store.getAllKeys()
      const values = store.getAll()
      tx.oncomplete = () => {
        try {
          resolve(keys.result.map((key, index) => ({
            id: String(key), value: this.codec.parse(values.result[index] as string),
          })))
        } catch (error) { reject(error) }
      }
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB list failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB list aborted'))
    })
  }

  async load(id: string): Promise<T | null> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const request = tx.objectStore(this.storeName).get(id)
      tx.oncomplete = () => {
        try { resolve(request.result === undefined ? null : this.codec.parse(request.result as string)) }
        catch (error) { reject(error) }
      }
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB load failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB load aborted'))
    })
  }

  async save(id: string, value: T): Promise<void> {
    await this.write((store) => store.put(this.codec.serialize(value), id))
  }

  async delete(id: string): Promise<void> {
    await this.write((store) => store.delete(id))
  }

  private async write(action: (store: IDBObjectStore) => IDBRequest): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      action(tx.objectStore(this.storeName))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'))
    })
  }
}

export class IndexedDBTileToyStorage implements TileToyStorage {
  readonly scenes: Storage<Scene>
  readonly stamps: Storage<StampLibrary>
  readonly meta: Storage<WorkspaceMeta>
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(private readonly databaseName = 'tile-toy') {
    const open = () => this.open()
    this.scenes = new IndexedDBCollection(open, 'scenes', { parse: parseScene, serialize: serializeScene })
    this.stamps = new IndexedDBCollection(open, 'stamps',
      { parse: parseStampLibrary, serialize: serializeStampLibrary })
    this.meta = new IndexedDBCollection(open, 'meta',
      { parse: parseWorkspaceMeta, serialize: JSON.stringify })
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const name of ['scenes', 'stamps', 'meta'] as const) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
        }
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => { db.close(); this.dbPromise = null }
        resolve(db)
      }
      request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
      request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another tab'))
    }).catch((error: unknown) => { this.dbPromise = null; throw error })
    this.dbPromise = pending
    return pending
  }
}
