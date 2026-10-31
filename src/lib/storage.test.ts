import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument } from './document'
import { loadWorkspace, readRecovery, saveDocument, writeRecovery } from './storage'

beforeEach(async () => {
  await loadWorkspace()
  const db = await openDB('wordcraft-desktop', 1)
  await db.clear('documents')
  await db.clear('settings')
  db.close()
})

describe('local persistence', () => {
  it('atomically saves content and the active document', async () => {
    const doc = createDocument('A saved document')
    await saveDocument(doc)
    const workspace = await loadWorkspace()
    expect(workspace.documents).toEqual([doc])
    expect(workspace.activeId).toBe(doc.id)
  })
  it('updates a document without creating duplicate records', async () => {
    const doc = createDocument()
    await saveDocument(doc)
    await saveDocument({ ...doc, title: 'Renamed' })
    const workspace = await loadWorkspace()
    expect(workspace.documents).toHaveLength(1)
    expect(workspace.documents[0].title).toBe('Renamed')
  })
  it('removes only recovery snapshots that have been saved', async () => {
    const doc = createDocument()
    writeRecovery(doc)
    expect(await readRecovery()).toEqual(doc)
    await saveDocument(doc)
    expect(await readRecovery()).toBeUndefined()
  })
  it('retains a newer emergency snapshot during an older save', async () => {
    const doc = createDocument()
    const newer = { ...doc, title: 'Newer', updatedAt: new Date(Date.now() + 1000).toISOString() }
    writeRecovery(newer)
    await saveDocument(doc)
    expect(await readRecovery()).toEqual(newer)
  })
  it('does not overwrite stored documents with invalid input', async () => {
    const doc = createDocument()
    await saveDocument(doc)
    await expect(saveDocument({ ...doc, version: 2 } as never)).rejects.toThrow()
    expect((await loadWorkspace()).documents).toEqual([doc])
  })
})
