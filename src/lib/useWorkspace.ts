import { useCallback, useEffect, useRef, useState } from 'react'
import { createDocument, sampleDocument, type CraftDocument } from './document'
import { validateContent } from './editor'
import { loadWorkspace, readRecovery, saveDocument, writeRecovery } from './storage'
import { isDesktop } from './desktop'

export function useWorkspace() {
  const [current, setCurrent] = useState<CraftDocument>()
  const [documents, setDocuments] = useState<CraftDocument[]>([])
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const currentRef = useRef<CraftDocument | undefined>(undefined)
  const dirty = useRef(false)
  const queue = useRef<Promise<void>>(Promise.resolve())

  const persist = useCallback(async () => {
    const snapshot = currentRef.current
    if (!snapshot || !dirty.current) return
    setStatus('saving')
    const job = queue.current.catch(() => {}).then(() => saveDocument(snapshot))
    queue.current = job
    try {
      await job
      setDocuments(docs => [snapshot, ...docs.filter(doc => doc.id !== snapshot.id)])
      if (currentRef.current === snapshot) {
        dirty.current = false
        setStatus('saved')
        setError('')
      }
    } catch {
      setStatus('error')
      setError('Could not save to this device. Keep this window open and export a .wordcraft backup, or retry saving.')
      throw new Error('Local save failed. Export a backup before leaving this document.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function initialize() {
      try {
        const workspace = await loadWorkspace()
        let docs = workspace.documents
        let active = docs.find(doc => doc.id === workspace.activeId) ?? docs[0]
        try {
          const recovery = await readRecovery()
          const stored = docs.find(doc => doc.id === recovery?.id)
          if (recovery && (!stored || recovery.updatedAt >= stored.updatedAt)) {
            validateContent(recovery.content)
            docs = [recovery, ...docs.filter(doc => doc.id !== recovery.id)]
            active = recovery
          }
        } catch {
          if (!cancelled) setError('A recovery snapshot could not be read. Stored documents have not been changed.')
        }
        active ??= sampleDocument()
        validateContent(active.content)
        if (cancelled) return
        currentRef.current = active
        dirty.current = true
        setCurrent(active)
        setDocuments(docs.length ? docs : [active])
        setReady(true)
      } catch {
        if (!cancelled) setError(`Your workspace could not be opened. No stored documents have been overwritten. ${isDesktop() ? 'Check that your user data folder is writable, then retry.' : 'Check that browser storage is enabled, then reload.'}`)
      }
    }
    void initialize()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready || !current || !dirty.current) return
    const timer = setTimeout(() => { void persist().catch(() => {}) }, 400)
    return () => clearTimeout(timer)
  }, [current, ready, persist])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  const update = useCallback((patch: Partial<Pick<CraftDocument, 'content' | 'title' | 'page'>>) => {
    const previous = currentRef.current
    if (!previous) return
    const next = { ...previous, ...patch, updatedAt: new Date(Math.max(Date.now(), Date.parse(previous.updatedAt) + 1)).toISOString() }
    currentRef.current = next
    dirty.current = true
    writeRecovery(next)
    setCurrent(next)
    setStatus('saving')
  }, [])

  const activate = useCallback(async (doc: CraftDocument) => {
    validateContent(doc.content)
    await persist()
    currentRef.current = doc
    dirty.current = true
    writeRecovery(doc)
    setCurrent(doc)
    setDocuments(docs => [doc, ...docs.filter(item => item.id !== doc.id)])
    await persist()
  }, [persist])

  const newDocument = useCallback(async () => { await activate(createDocument()) }, [activate])

  return { current, documents, ready, status, error, update, activate, newDocument, persist }
}
