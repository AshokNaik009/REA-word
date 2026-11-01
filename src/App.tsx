import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import {
  ArrowDownToLine, ArrowLeft, Check, CheckCheck, ChevronDown, CircleHelp, Command,
  FilePlus2, FileText, Focus, FolderOpen, Leaf, LoaderCircle, PanelLeftClose, PanelLeftOpen,
  Printer, Search, ShieldCheck, X,
} from 'lucide-react'
import { extensions, sanitizeHTML } from './lib/editor'
import { importFile, pickNativeFile, saveExport, type OpenedFile } from './lib/files'
import { isSafeLink, MAX_FILE_BYTES, pageDimensions, type ExportFormat } from './lib/document'
import { useWorkspace } from './lib/useWorkspace'
import { isDesktop, native, printDocument } from './lib/desktop'
import { IconButton } from './components/Button'
import { Modal } from './components/Modal'
import { Ribbon, type RibbonTab } from './components/Ribbon'
import { Sidebar } from './components/Sidebar'
import { ParagraphDialog } from './components/ParagraphDialog'
import { EditorSession } from './engine/session'
import { createAutomation } from './engine/automation'

type Dialog = 'file' | 'export' | 'link' | 'commands' | 'about' | 'paragraph' | null
type Notice = { message: string; error?: boolean } | undefined

export function App() {
  const workspace = useWorkspace()
  const [notice, setNotice] = useState<Notice>()
  if (!workspace.ready || !workspace.current) return <div className="loading-screen"><img src="/favicon.svg" alt="" /><h1>Wordcraft</h1>{workspace.error ? <><p role="alert">{workspace.error}</p><button className="primary-button" onClick={() => location.reload()}>Retry opening workspace</button></> : <p><LoaderCircle className="spin" size={16} />Making room for your words...</p>}</div>
  return <Writer key={workspace.current.id} workspace={workspace} notice={notice} setNotice={setNotice} />
}

function Writer({ workspace, notice, setNotice }: { workspace: ReturnType<typeof useWorkspace>; notice: Notice; setNotice: Dispatch<SetStateAction<Notice>> }) {
  const doc = workspace.current!
  const [tab, setTab] = useState<RibbonTab>('Home')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 580)
  const [finding, setFinding] = useState(false)
  const [focus, setFocus] = useState(false)
  const [marks, setMarks] = useState(false)
  const [zoom, setZoom] = useState(90)
  const [availableWidth, setAvailableWidth] = useState(1000)
  const [format, setFormat] = useState<ExportFormat>('wordcraft')
  const [link, setLink] = useState('')
  const [commandQuery, setCommandQuery] = useState('')
  const viewport = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const saveRef = useRef(workspace.persist)
  saveRef.current = workspace.persist

  const editor = useEditor({
    extensions,
    content: doc.content,
    autofocus: false,
    editorProps: {
      attributes: { class: 'document-content', 'aria-label': 'Document editor', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' },
      transformPastedHTML: sanitizeHTML,
    },
    onUpdate: ({ editor: activeEditor }) => workspace.update({ content: activeEditor.getJSON() }),
  }, [doc.id])
  const stats = useEditorState({ editor, selector: ({ editor: e }) => ({
    words: e.storage.characterCount.words() as number,
    characters: e.storage.characterCount.characters() as number,
  }) })
  const session = useMemo(() => editor ? new EditorSession(editor) : null, [editor])
  const execute = (id: string, params: unknown = {}) => {
    if (!session) return false
    const result = session.execute(id, params)
    if (!result.ok) setNotice({ message: result.error.message, error: true })
    return result.ok
  }

  useEffect(() => {
    if (!session) return
    const api = createAutomation(session)
    window.wordcraft = api
    return () => { if (window.wordcraft === api) delete window.wordcraft }
  }, [session])

  useEffect(() => {
    if (!session) return
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!(event.metaKey || event.ctrlKey) || !target?.closest('.document-content')) return
      const id = event.key === 'Enter' && !event.shiftKey ? 'insert.pageBreak'
        : event.key.toLowerCase() === 'a' && !event.shiftKey ? 'select.all'
        : event.key.toLowerCase() === 'z' ? event.shiftKey ? 'edit.redo' : 'edit.undo'
        : event.key.toLowerCase() === 'y' ? 'edit.redo'
        : event.key.toLowerCase() === 'b' && !event.shiftKey ? 'format.bold'
        : event.key.toLowerCase() === 'i' && !event.shiftKey ? 'format.italic'
        : event.key.toLowerCase() === 'u' && !event.shiftKey ? 'format.underline'
        : event.key === '=' && !event.shiftKey ? 'format.subscript'
        : event.key === '+' && event.shiftKey ? 'format.superscript'
        : null
      if (id) { event.preventDefault(); event.stopPropagation(); execute(id) }
    }
    document.addEventListener('keydown', keydown, true)
    return () => document.removeEventListener('keydown', keydown, true)
  }, [session])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(entries => setAvailableWidth(entries[0].contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [editor])

  useEffect(() => {
    document.title = `${doc.title || 'Untitled document'} - Wordcraft`
    if (isDesktop()) void native().window.setTitle(document.title).catch(() => {})
  }, [doc.title])

  useEffect(() => {
    if (!isDesktop()) return
    let disposed = false
    let unlisten: (() => void) | undefined
    let closing = false
    const onClose = async () => {
        if (closing) return
        closing = true
        try { await saveRef.current(); await native().app.exit() }
        catch { setNotice({ message: 'Your latest changes could not be saved. Export a backup before closing.', error: true }); closing = false }
    }
    void native().events.on('windowClose', onClose).then(() => {
      const cleanup = () => { void native().events.off('windowClose', onClose) }
      if (disposed) cleanup()
      else unlisten = cleanup
    }).catch(() => {})
    return () => { disposed = true; unlisten?.() }
  }, [])

  const perform = useCallback(async (action: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try { await action() } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : 'That action could not be completed. Your current document has not been discarded.', error: true })
    } finally { busyRef.current = false; setBusy(false) }
  }, [])

  const acceptFile = async (file: OpenedFile) => {
    const imported = await importFile(file)
    await workspace.activate(imported.document)
    setNotice({ message: imported.warning ?? `Opened ${file.name} as a new workspace copy.` })
    setDialog(null)
  }
  const open = () => {
    setDialog(null)
    if (isDesktop()) void perform(async () => { const file = await pickNativeFile(); if (file) await acceptFile(file) })
    else fileInput.current?.click()
  }
  const newDocument = () => { setDialog(null); void perform(workspace.newDocument) }
  const find = () => { setSidebar(true); setFinding(true); setFocus(false); setDialog(null) }
  const print = () => {
    setDialog(null)
    // A dedicated print stylesheet removes the app chrome and the canvas zoom.
    setTimeout(() => { void perform(printDocument) }, 50)
  }
  const showLink = () => { setLink(editor?.getAttributes('link').href ?? ''); setDialog('link') }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dialog) { setFocus(false); return }
      if (!(event.metaKey || event.ctrlKey) || event.altKey || (event.target as HTMLElement).closest('dialog')) return
      switch (event.key.toLowerCase()) {
        case 's': event.preventDefault(); if (event.shiftKey) setDialog('export'); else void perform(async () => { await workspace.persist(); setNotice({ message: 'Saved to this device.' }) }); break
        case 'o': event.preventDefault(); open(); break
        case 'n': event.preventDefault(); newDocument(); break
        case 'f': event.preventDefault(); find(); break
        case 'k': event.preventDefault(); showLink(); break
        case 'p': event.preventDefault(); print(); break
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  if (!editor) return null
  const dimensions = pageDimensions(doc.page)
  const compact = availableWidth < 560
  const scale = compact ? 1 : Math.min(zoom / 100, Math.max(0.28, (availableWidth - 96) / dimensions.width))
  const paperStyle = {
    '--paper-width': `${compact ? Math.max(270, availableWidth - 24) : dimensions.width}px`, '--paper-height': `${dimensions.height}px`,
    '--page-margin': `${compact ? 26 : dimensions.margin}px`, '--page-scale': scale,
  } as CSSProperties
  const commands = [
    { label: 'New document', hint: 'Cmd/Ctrl N', action: newDocument, icon: FilePlus2 },
    { label: 'Open a document', hint: 'Cmd/Ctrl O', action: open, icon: FolderOpen },
    { label: 'Export document', hint: 'Cmd/Ctrl Shift S', action: () => setDialog('export'), icon: ArrowDownToLine },
    { label: 'Find and replace', hint: 'Cmd/Ctrl F', action: find, icon: Search },
    { label: 'Paragraph settings', hint: 'Spacing, indents, direction', action: () => setDialog('paragraph'), icon: FileText },
    { label: 'Focus mode', hint: 'Escape to exit', action: () => { setFocus(value => !value); setDialog(null) }, icon: Focus },
    { label: 'Print or save as PDF', hint: 'Cmd/Ctrl P', action: print, icon: Printer },
    ...(session?.commands().filter(command => command.preset !== undefined).map(command => ({
      label: command.label, hint: command.id, icon: FileText,
      action: () => { execute(command.id, command.preset); setDialog(null); editor.commands.focus() },
    })) ?? []),
  ].filter(command => `${command.label} ${command.hint}`.toLowerCase().includes(commandQuery.toLowerCase()))

  return <div className={`app ${focus ? 'focus-mode' : ''}`} aria-busy={busy}>
    <header className="titlebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setDialog('about') }} aria-label="About Wordcraft"><img src="/favicon.svg" alt="" /><span>wordcraft<span className="brand-dot">.</span></span><span className="desktop-tag">DESKTOP</span></a>
      <div className="document-title"><input aria-label="Document title" value={doc.title} maxLength={200} onChange={event => workspace.update({ title: event.target.value })} /><span className={`save-indicator ${workspace.status}`} title={workspace.status === 'saved' ? 'Saved on this device' : workspace.status === 'saving' ? 'Saving changes' : 'Local save failed'}>{workspace.status === 'saved' ? <CheckCheck size={15} /> : workspace.status === 'saving' ? <LoaderCircle size={14} className="spin" /> : <X size={14} />}</span></div>
      <button className="command-search" onClick={() => { setCommandQuery(''); setDialog('commands') }}><Search size={15} /><span>Find a command...</span><kbd><Command size={10} /></kbd></button>
      <IconButton icon={CircleHelp} label="About and keyboard shortcuts" onClick={() => setDialog('about')} />
    </header>
    <div className="tabs-row">
      <nav className="ribbon-tabs" aria-label="Ribbon tabs"><button className="file-tab" onClick={() => setDialog('file')}>File</button>{(['Home', 'Insert', 'Layout', 'View'] as const).map(name => <button key={name} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}>{name}</button>)}</nav>
      <div className="workspace-state"><span />LOCAL WORKSPACE</div>
      <button className="export-button" onClick={() => setDialog('export')} disabled={busy}><ArrowDownToLine size={16} /><span>Export</span><ChevronDown size={13} /></button>
    </div>
    <Ribbon editor={editor} execute={execute} onParagraph={() => setDialog('paragraph')} tab={tab} document={doc} onPageChange={page => workspace.update({ page })} onLink={showLink} onImage={() => imageInput.current?.click()} onFind={find} onNew={newDocument} onOpen={open} onExport={() => setDialog('export')} onPrint={print} focus={focus} onFocus={() => setFocus(value => !value)} showMarks={marks} onMarks={() => setMarks(value => !value)} />
    {(notice || workspace.error) && <div role={notice?.error || workspace.error ? 'alert' : 'status'} className={`notice ${notice?.error || workspace.error ? 'error' : ''}`}><span>{workspace.error || notice?.message}</span>{workspace.error && <button onClick={() => void perform(workspace.persist)}>Retry save</button>}<IconButton icon={X} label="Dismiss message" onClick={() => setNotice(undefined)} /></div>}
    <div className="workspace">
      {sidebar && <Sidebar editor={editor} current={doc} documents={workspace.documents} onActivate={next => void perform(async () => { await workspace.activate(next) })} onNew={newDocument} finding={finding} onFinding={setFinding} onClose={() => setSidebar(false)} />}
      <main className="canvas" ref={viewport} aria-label="Writing canvas">
        <div className="canvas-topline"><button className="canvas-toggle" onClick={() => setSidebar(value => !value)}>{sidebar ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}<span>{sidebar ? 'Hide' : 'Show'} navigation</span></button><span className="canvas-caption">A SPACE FOR YOUR WORDS</span><button className="canvas-toggle" onClick={() => setFocus(value => !value)}><Focus size={14} /><span>Focus</span></button></div>
        <div className="page-stage" style={paperStyle}>
          <div className="ruler" aria-hidden="true"><span className="ruler-margin" /><div>{Array.from({ length: 15 }, (_, index) => <span key={index}>{index}</span>)}</div><span className="ruler-margin" /></div>
          <article className={`paper ${marks ? 'show-marks' : ''}`} aria-label="Document page">
            <div className="paper-running-header"><span>{doc.title || 'Untitled document'}</span><span>PERSONAL EDITION</span></div>
            <EditorContent editor={editor} />
            <div className="paper-footer"><span>MADE OF WORDS. MADE BY YOU.</span><span>WORDCRAFT</span></div>
          </article>
        </div>
        <div className="canvas-bottom-note"><Leaf size={13} />Take your time. Good things take a few drafts.</div>
      </main>
    </div>
    <footer className="statusbar"><div><span className="saved-dot" /><span>{workspace.status === 'saved' ? 'All changes saved locally' : workspace.status === 'saving' ? 'Saving locally...' : 'Not saved - export a backup'}</span><span className="status-divider" /><span>{stats?.words ?? 0} words</span><span className="character-count">{stats?.characters ?? 0} characters</span></div><div><button onClick={() => setFocus(value => !value)}><Focus size={14} />{focus ? 'Exit focus' : 'Focus'}</button><span className="status-divider" /><span className="page-size-label">{doc.page.size}</span><input aria-label="Document zoom" type="range" min="50" max="150" step="5" value={zoom} onChange={event => setZoom(Number(event.target.value))} /><button className="zoom-value" title="Reset zoom to 100%" onClick={() => setZoom(100)}>{Math.round(scale * 100)}%</button></div></footer>
    {focus && <button className="exit-focus" onClick={() => setFocus(false)}><ArrowLeft size={15} />Exit focus <kbd>esc</kbd></button>}
    <input ref={fileInput} className="hidden-input" type="file" aria-label="Open document file" accept=".wordcraft,.docx,.html,.htm,.txt" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void perform(async () => { if (file.size > MAX_FILE_BYTES) throw new Error('Please choose a document smaller than 20 MB.'); await acceptFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }) }) }} />
    <input ref={imageInput} className="hidden-input" type="file" aria-label="Insert image file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; void perform(async () => { if (file.size > 5 * 1024 * 1024) throw new Error('Please choose an image smaller than 5 MB.'); if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('Use a PNG, JPEG, GIF or WebP image.'); const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read this image.')); reader.readAsDataURL(file) }); const image = new Image(); image.src = data; await image.decode(); const width = Math.min(620, image.naturalWidth); editor.chain().focus().setImage({ src: data, alt: file.name, width, height: Math.round(width * image.naturalHeight / image.naturalWidth) }).run() }) }} />
    {dialog === 'paragraph' && session && <ParagraphDialog session={session} onApply={properties => execute('wc.paragraph', properties)} onClose={() => setDialog(null)} />}
    {dialog === 'file' && <Modal title="Make something worth keeping." onClose={() => setDialog(null)}>
      <p className="modal-description">Your workspace, your documents, your device.</p>
      <div className="file-actions"><button onClick={newDocument}><FilePlus2 /><span><strong>New document</strong><small>A fresh page and a little possibility.</small></span><kbd>N</kbd></button><button onClick={open}><FolderOpen /><span><strong>Open a document</strong><small>Wordcraft, DOCX, HTML or plain text.</small></span><kbd>O</kbd></button><button onClick={() => setDialog('export')}><ArrowDownToLine /><span><strong>Export a copy</strong><small>Keep a backup or take it somewhere new.</small></span></button><button onClick={print}><Printer /><span><strong>Print or save as PDF</strong><small>Using your system's print dialog.</small></span><kbd>P</kbd></button></div>
      <p className="privacy-note"><ShieldCheck size={15} />Nothing is uploaded. Files are processed on this device.</p>
    </Modal>}
    {dialog === 'export' && <Modal title="Good words travel." onClose={() => setDialog(null)}>
      <p className="modal-description">Export a copy of <strong>{doc.title || 'Untitled document'}</strong>.</p>
      <form onSubmit={event => { event.preventDefault(); void perform(async () => { const exported = await saveExport(doc, format, editor.getHTML()); if (exported) { setNotice({ message: `Exported a .${format} copy. Your workspace document is still saved locally.` }); setDialog(null) } }) }}>
        <div className="format-options">{([
          ['wordcraft', 'Wordcraft document', 'Full-fidelity backup. Best for continuing here.', 'RECOMMENDED'],
          ['docx', 'Word document', 'Basic text, styles, lists, tables and PNG/JPEG/GIF images.', '.DOCX'],
          ['html', 'Web document', 'Formatted text and embedded images for the web.', '.HTML'],
          ['txt', 'Plain text', 'Just the words, without formatting or images.', '.TXT'],
        ] as const).map(([value, title, description, tag]) => <label key={value} className={`format-option ${format === value ? 'selected' : ''}`}><input type="radio" name="format" value={value} checked={format === value} onChange={() => setFormat(value)} /><FileText size={22} /><span><strong>{title}</strong><small>{description}</small></span><span className="format-tag">{tag}</span></label>)}</div>
        {format === 'docx' && <p className="export-caution">Basic DOCX exchange, not a lossless Word round trip. Custom highlight colors, WebP images, table row spans and advanced layout are not preserved exactly. Keep a .wordcraft backup.</p>}
        <div className="modal-footer"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={16} />}Export {format === 'wordcraft' ? 'document' : `.${format}`}</button></div>
      </form>
    </Modal>}
    {dialog === 'link' && <Modal title="Connect the dots." onClose={() => setDialog(null)}>
      <p className="modal-description">Add a link to your selected text.</p>
      <form onSubmit={event => { event.preventDefault(); const url = link.trim(); if (!isSafeLink(url)) { setNotice({ message: 'Use a link beginning with https://, http://, mailto: or #.', error: true }); return }; editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run(); setDialog(null) }}>
        <label className="form-label" htmlFor="link-url">Web address or email link</label><input id="link-url" className="full-input" autoFocus value={link} onChange={event => setLink(event.target.value)} placeholder="https://example.com" required />
        <div className="modal-footer"><button type="button" className="secondary-button" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setDialog(null) }}>Remove link</button><button className="primary-button">Apply link <Check size={16} /></button></div>
      </form>
    </Modal>}
    {dialog === 'commands' && <Modal title="What would you like to do?" onClose={() => setDialog(null)}>
      <div className="palette-input"><Search size={18} /><input autoFocus aria-label="Search commands" placeholder="Find a command..." value={commandQuery} onChange={event => setCommandQuery(event.target.value)} /></div>
      <div className="command-list">{commands.map(({ label, hint, action, icon: Icon }) => <button key={label} onClick={action}><Icon size={18} /><span>{label}</span><small>{hint}</small></button>)}{!commands.length && <p className="modal-description">No matching commands. Try "open", "table" or "focus".</p>}</div>
    </Modal>}
    {dialog === 'about' && <Modal title="A space for your words." onClose={() => setDialog(null)}>
      <div className="about-brand"><img src="/favicon.svg" alt="" /><div><h3>Wordcraft Desktop <span>0.2.0</span></h3><p>TypeScript + React + Neutralinojs WebView</p></div></div>
      <p className="modal-description">An independent reimplementation inspired by the open-source WordCraft project. Built for thoughtful, local-first writing. This initial version does not reproduce the original's full feature set or Word's layout engine.</p>
      <div className="shortcut-list">{[['Save locally', 'Cmd/Ctrl S'], ['Export a copy', 'Cmd/Ctrl Shift S'], ['Open document', 'Cmd/Ctrl O'], ['New document', 'Cmd/Ctrl N'], ['Find and replace', 'Cmd/Ctrl F'], ['Insert a link', 'Cmd/Ctrl K'], ['Print / PDF', 'Cmd/Ctrl P'], ['Bold / italic / underline', 'Cmd/Ctrl B / I / U']].map(([action, shortcut]) => <div key={action}><span>{action}</span><kbd>{shortcut}</kbd></div>)}</div>
      <p className="privacy-note"><ShieldCheck size={17} />Documents stay local. Export backups: browser data can be cleared.</p>
    </Modal>}
    <style>{`@page { size: ${doc.page.size} ${doc.page.orientation}; margin: ${(dimensions.margin / 3.78).toFixed(1)}mm; }`}</style>
  </div>
}
