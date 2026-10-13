import { applyCommand, type Command } from './commands'
import type { Scene } from './types'

export class SceneHistory {
  private past: Scene[] = []
  private future: Scene[] = []
  private current: Scene

  constructor(initial: Scene, private readonly limit = 100) { this.current = initial }
  get scene(): Scene { return this.current }
  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  setMetadata(metadata: Scene['metadata']): void {
    const withMetadata = (scene: Scene): Scene => ({ ...scene, metadata })
    this.current = withMetadata(this.current)
    this.past = this.past.map(withMetadata)
    this.future = this.future.map(withMetadata)
  }

  execute(command: Command): Scene {
    const next = applyCommand(this.current, command)
    this.past.push(this.current)
    if (this.past.length > this.limit) this.past.shift()
    this.current = next
    this.future = []
    return next
  }

  undo(): Scene {
    const previous = this.past.pop()
    if (previous) { this.future.push(this.current); this.current = previous }
    return this.current
  }

  redo(): Scene {
    const next = this.future.pop()
    if (next) { this.past.push(this.current); this.current = next }
    return this.current
  }
}
