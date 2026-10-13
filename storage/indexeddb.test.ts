import { expect, test } from 'vitest'
import { parseWorkspaceMeta } from './indexeddb'

test('older workspace metadata defaults to the top toolbar position', () => {
  expect(parseWorkspaceMeta(JSON.stringify({ schemaVersion: 1, lastOpenedSceneId: 'scene-1', activeColor: 4 })))
    .toEqual({ schemaVersion: 2, lastOpenedSceneId: 'scene-1', activeColor: 4,
      toolbarPlacement: 'top' })
})
