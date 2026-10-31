import { openDB, type DBSchema } from 'idb'
import { documentSchema, parseDocument, type CraftDocument } from './document'
import { z } from 'zod'
import { isDesktop, native } from './desktop'

interface WorkspaceDB extends DBSchema {
  documents: { key: string; value: CraftDocument }
  settings: { key: string; value: string }
}

const database = () => openDB<WorkspaceDB>('wordcraft-desktop', 1, {
  upgrade(db) {
    db.createObjectStore('documents', { keyPath: 'id' })
    db.createObjectStore('settings')
  },
})
const RECOVERY_KEY = 'wordcraft-recovery-v1'
const nativeSchema = z.object({
  version: z.literal(1),
  generation: z.number().int().nonnegative().safe(),
  documents: z.array(documentSchema).max(500),
  activeId: z.string().optional(),
})
type NativeWorkspace = z.infer<typeof nativeSchema>
let nativeWorkspace: NativeWorkspace | undefined
let recoveryQueue: Promise<unknown> = Promise.resolve()

async function nativeKeys(): Promise<string[]> {
  try { return await native().storage.getKeys() }
  catch (error) {
    if ((error as { code?: string })?.code !== 'NE_ST_NOSTDIR') throw error
    // Neutralino does not create .storage until its first write. Seed only a
    // reserved marker, then retry; never interpret other I/O failures as empty.
    await native().storage.setData('workspace-init-v1', '1')
    return await native().storage.getKeys()
  }
}

async function loadNativeWorkspace(): Promise<NativeWorkspace> {
  const keys = await nativeKeys()
  const slots = ['workspace-a', 'workspace-b'].filter(key => keys.includes(key))
  const snapshots = await Promise.all(slots.map(async key => {
    try { return nativeSchema.parse(JSON.parse(await native().storage.getData(key))) }
    catch { return undefined }
  }))
  const latest = snapshots.filter((item): item is NativeWorkspace => Boolean(item)).sort((a, b) => b.generation - a.generation)[0]
  if (!latest && slots.length) throw new Error('Stored workspace snapshots could not be read. They have not been overwritten.')
  return latest ?? { version: 1, generation: 0, documents: [] }
}

export async function loadWorkspace(): Promise<{ documents: CraftDocument[]; activeId?: string }> {
  if (isDesktop()) {
    // Native storage survives the random localhost port used by the WebView.
    nativeWorkspace = await loadNativeWorkspace()
    return { documents: [...nativeWorkspace.documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), activeId: nativeWorkspace.activeId }
  }
  const db = await database()
  const [raw, activeId] = await Promise.all([db.getAll('documents'), db.get('settings', 'activeId')])
  const documents = raw.map(value => documentSchema.parse(value))
  return { documents: documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), activeId }
}

export async function saveDocument(doc: CraftDocument): Promise<void> {
  documentSchema.parse(doc)
  if (isDesktop()) {
    if (!nativeWorkspace) throw new Error('Workspace is not initialized')
    const next = nativeSchema.parse({
      version: 1, generation: nativeWorkspace.generation + 1, activeId: doc.id,
      documents: [doc, ...nativeWorkspace.documents.filter(item => item.id !== doc.id)],
    })
    await recoveryQueue
    // Alternate complete snapshots so an interrupted write retains the other slot.
    await native().storage.setData(next.generation % 2 ? 'workspace-a' : 'workspace-b', JSON.stringify(next))
    nativeWorkspace = next
    return
  }
  const db = await database()
  const tx = db.transaction(['documents', 'settings'], 'readwrite')
  await tx.objectStore('documents').put(doc)
  await tx.objectStore('settings').put(doc.id, 'activeId')
  await tx.done
  try {
    const recovery = await readRecovery()
    if (recovery?.id === doc.id && JSON.stringify(recovery) === JSON.stringify(doc)) localStorage.removeItem(RECOVERY_KEY)
  } catch { /* The IndexedDB transaction is already durable. */ }
}

export function writeRecovery(doc: CraftDocument): void {
  if (isDesktop()) {
    const snapshot = JSON.stringify(doc)
    recoveryQueue = recoveryQueue.catch(() => {}).then(() => native().storage.setData(RECOVERY_KEY, snapshot)).catch(() => {})
    return
  }
  try { localStorage.setItem(RECOVERY_KEY, JSON.stringify(doc)) } catch { /* Full documents still save to IndexedDB; leave the previous recovery intact. */ }
}

export async function readRecovery(): Promise<CraftDocument | undefined> {
  if (isDesktop()) {
    const keys = await nativeKeys()
    return keys.includes(RECOVERY_KEY) ? parseDocument(await native().storage.getData(RECOVERY_KEY)) : undefined
  }
  const text = localStorage.getItem(RECOVERY_KEY)
  return text ? parseDocument(text) : undefined
}
