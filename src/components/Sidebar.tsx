import { useMemo, useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, ChevronDown, FileText, HardDrive, Hash, Plus, Search, X } from 'lucide-react'
import { findMatches } from '../lib/editor'
import type { CraftDocument } from '../lib/document'
import { IconButton } from './Button'

interface SidebarProps {
  editor: Editor
  current: CraftDocument
  documents: CraftDocument[]
  onActivate: (document: CraftDocument) => void
  onNew: () => void
  finding: boolean
  onFinding: (finding: boolean) => void
  onClose: () => void
}

export function Sidebar({ editor, current, documents, onActivate, onNew, finding, onFinding, onClose }: SidebarProps) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [index, setIndex] = useState(0)
  const state = useEditorState({ editor, selector: ({ editor: e }) => ({ doc: e.state.doc }) })
  const headings = useMemo(() => {
    const result: { text: string; level: number; pos: number }[] = []
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') result.push({ text: node.textContent || 'Untitled heading', level: node.attrs.level, pos })
    })
    return result
  }, [state.doc])
  const matches = useMemo(() => findMatches(state.doc, query), [state.doc, query])
  const goTo = (next: number) => {
    if (!matches.length) return
    const normalized = (next + matches.length) % matches.length
    setIndex(normalized)
    editor.chain().focus().setTextSelection(matches[normalized]).scrollIntoView().run()
  }
  const replaceAll = () => {
    const transaction = editor.state.tr
    for (const match of [...matches].reverse()) {
      if (replacement) transaction.insertText(replacement, match.from, match.to)
      else transaction.delete(match.from, match.to)
    }
    editor.view.dispatch(transaction)
    setIndex(0)
  }
  return <aside className="sidebar" aria-label="Document navigation">
    <div className="sidebar-section-label">YOUR WORKSPACE <span className="local-badge">LOCAL</span><IconButton className="sidebar-close" icon={X} label="Close navigation" onClick={onClose} /></div>
    <div className="library-heading"><span>Documents <ChevronDown size={13} /></span><IconButton icon={Plus} label="New document" onClick={onNew} /></div>
    <div className="document-list">{documents.map(doc => <button key={doc.id} title={doc.title} className={`document-item ${doc.id === current.id ? 'selected' : ''}`} onClick={() => { if (doc.id !== current.id) onActivate(doc) }}><FileText size={17} /><span>{doc.id === current.id ? current.title || 'Untitled document' : doc.title || 'Untitled document'}</span>{doc.id === current.id && <span className="selected-dot" />}</button>)}</div>
    <div className="sidebar-tabs" role="tablist" aria-label="Navigation mode"><button role="tab" aria-selected={!finding} onClick={() => onFinding(false)}><Hash size={14} />Outline</button><button role="tab" aria-selected={finding} onClick={() => onFinding(true)}><Search size={14} />Find</button></div>
    {!finding ? <div className="outline">
      <div className="outline-label">IN THIS DOCUMENT</div>
      {headings.length ? headings.map(heading => <button key={heading.pos} className={`outline-item level-${heading.level}`} onClick={() => editor.chain().focus().setTextSelection(heading.pos + 1).scrollIntoView().run()}><span className="outline-marker" />{heading.text}</button>) : <p className="sidebar-empty">Give your words some structure.<br />Headings appear here as you write.</p>}
      <div className="outline-end"><span />End of document</div>
    </div> : <div className="find-panel">
      <label htmlFor="find-query">Find in document</label>
      <div className="find-input"><input id="find-query" autoFocus value={query} placeholder="A word or a phrase..." onChange={event => { setQuery(event.target.value); setIndex(0) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); goTo(event.shiftKey ? index - 1 : index + 1) } }} /><IconButton icon={X} label="Clear search" onClick={() => setQuery('')} /></div>
      <div className="find-results"><span>{matches.length ? `${matches.length} matches` : query ? 'No matches' : 'Search your writing'}</span><IconButton icon={ArrowUp} label="Previous match" disabled={!matches.length} onClick={() => goTo(index - 1)} /><IconButton icon={ArrowDown} label="Next match" disabled={!matches.length} onClick={() => goTo(index)} /></div>
      <label htmlFor="replace-query">Replace with</label><input id="replace-query" value={replacement} onChange={event => setReplacement(event.target.value)} placeholder="Replacement text" />
      <div className="replace-actions"><button className="secondary-button" disabled={!matches.length} onClick={() => { const match = matches[Math.min(index, matches.length - 1)]; if (match) { const transaction = editor.state.tr; if (replacement) transaction.insertText(replacement, match.from, match.to); else transaction.delete(match.from, match.to); editor.view.dispatch(transaction) } }}>Replace</button><button className="secondary-button" disabled={!matches.length} onClick={replaceAll}>Replace all</button></div>
      <small>Search is case-insensitive. Formatting around replacements is preserved.</small>
    </div>}
    <div className="sidebar-footer"><div className="local-icon"><HardDrive size={17} /></div><div><strong>A space of your own.</strong><p>Saved on this device.<br />No account. No cloud.</p></div></div>
  </aside>
}
