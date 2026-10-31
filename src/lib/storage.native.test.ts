import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from './document'

const { records, failWrite, missingDirectory } = vi.hoisted(() => ({ records: new Map<string, string>(), failWrite: { value: false }, missingDirectory: { value: false } }))
vi.mock('./desktop', () => ({
  isDesktop: () => true,
  native: () => ({
    storage: {
      getKeys: async () => {
        if (missingDirectory.value && !records.has('workspace-init-v1')) throw { code: 'NE_ST_NOSTDIR' }
        return [...records.keys()]
      },
      getData: async (key: string) => records.get(key),
      setData: async (key: string, data: string) => {
        if (failWrite.value) throw new Error('Disk full')
        records.set(key, data)
      },
    },
  }),
}))
import { loadWorkspace, readRecovery, saveDocument, writeRecovery } from './storage'

beforeEach(() => { records.clear(); failWrite.value = false; missingDirectory.value = false })

describe('native storage independent of WebView origin', () => {
  it('opens on first launch when Neutralino has not created the storage directory', async () => {
    missingDirectory.value = true
    expect(await loadWorkspace()).toEqual({ documents: [], activeId: undefined })
    expect(records.get('workspace-init-v1')).toBe('1')
    const doc = createDocument('First native draft')
    await saveDocument(doc)
    expect((await loadWorkspace()).documents).toEqual([doc])
  })
  it('does not treat an unwritable first-launch directory as an empty usable workspace', async () => {
    missingDirectory.value = true
    failWrite.value = true
    await expect(loadWorkspace()).rejects.toThrow('Disk full')
    expect(records.size).toBe(0)
  })
  it('restores documents and selection from native disk snapshots', async () => {
    await loadWorkspace()
    const doc = createDocument('Native writing')
    await saveDocument(doc)
    expect(await loadWorkspace()).toEqual({ documents: [doc], activeId: doc.id })
  })
  it('keeps the previous complete snapshot if a write fails', async () => {
    await loadWorkspace()
    const doc = createDocument('Original')
    await saveDocument(doc)
    failWrite.value = true
    await expect(saveDocument({ ...doc, title: 'Failed update' })).rejects.toThrow('Disk full')
    failWrite.value = false
    expect((await loadWorkspace()).documents).toEqual([doc])
  })
  it('falls back to the other slot after a truncated native write', async () => {
    await loadWorkspace()
    const doc = createDocument('First snapshot')
    await saveDocument(doc)
    await saveDocument({ ...doc, title: 'Second snapshot' })
    records.set('workspace-b', '{"truncated')
    expect((await loadWorkspace()).documents).toEqual([doc])
  })
  it('refuses to overwrite an entirely unreadable workspace', async () => {
    records.set('workspace-a', 'broken')
    records.set('workspace-b', 'broken')
    await expect(loadWorkspace()).rejects.toThrow('not been overwritten')
    expect(records.get('workspace-a')).toBe('broken')
  })
  it('writes recovery to native storage instead of origin-bound localStorage', async () => {
    await loadWorkspace()
    const doc = createDocument('Recovery')
    writeRecovery(doc)
    await saveDocument(doc)
    expect(await readRecovery()).toEqual(doc)
    expect(localStorage.length).toBe(0)
  })
})
