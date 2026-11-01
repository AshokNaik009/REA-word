import { Editor, generateJSON, type JSONContent } from '@tiptap/core'
import { CellSelection } from '@tiptap/pm/tables'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extensions } from '../lib/editor'
import { createDocument, parseDocument } from '../lib/document'
import { commandDefinitions } from './commands'
import { EditorSession } from './session'
import { createAutomation } from './automation'
import inventory from '../../docs/upstream-inventory.json'

const editors: Editor[] = []
function createSession(content = '<p>Alpha beta Alpha</p><p>Second paragraph</p>') {
  const editor = new Editor({ extensions, content })
  editors.push(editor)
  return new EditorSession(editor)
}
afterEach(() => { vi.restoreAllMocks(); for (const editor of editors.splice(0)) editor.destroy() })

describe('typed editor session', () => {
  it('exposes unique command IDs and JSON parameter schemas', () => {
    const session = createSession()
    expect(new Set(session.commands().map(command => command.id)).size).toBe(commandDefinitions.length)
    expect(session.commands().find(command => command.id === 'format.bold')?.parameters).toMatchObject({ type: 'object' })
  })
  it('retains the migrated command floor and uses source-backed upstream IDs', () => {
    const ids = new Set([...inventory.commands.map(command => command.id), ...inventory.catalog.map(command => command.id)])
    expect(commandDefinitions.length).toBeGreaterThanOrEqual(52)
    for (const command of commandDefinitions) if (!command.id.startsWith('wc.')) expect(ids.has(command.id), command.id).toBe(true)
  })
  it('uses one-based, case-sensitive upstream text selection', () => {
    const session = createSession()
    expect(session.execute('select.text', { text: 'Alpha', occurrence: 2 }).ok).toBe(true)
    expect(session.editor.state.selection.from).toBe(12)
    expect(session.execute('select.text', { text: 'alpha' }).ok).toBe(false)
    expect(session.execute('select.text', { text: 'Alpha', occurrence: 0 }).ok).toBe(false)
  })
  it('runs formatting through the same dispatcher and undo history', () => {
    const session = createSession()
    session.execute('select.text', { text: 'beta' })
    const before = session.document()
    expect(session.execute('format.bold', { value: true })).toMatchObject({ ok: true, changed: true })
    expect(session.editor.isActive('bold')).toBe(true)
    session.execute('edit.undo')
    expect(session.document()).toEqual(before)
    session.execute('edit.redo')
    expect(session.editor.isActive('bold')).toBe(true)
  })
  it('makes superscript and subscript mutually exclusive and native-format safe', () => {
    const session = createSession()
    session.execute('select.text', { text: 'beta' })
    session.execute('format.superscript')
    expect(session.editor.isActive('superscript')).toBe(true)
    session.execute('format.subscript')
    expect(session.editor.isActive('subscript')).toBe(true)
    expect(session.editor.isActive('superscript')).toBe(false)
    const document = createDocument('Script', session.document())
    expect(parseDocument(JSON.stringify(document)).content).toEqual(document.content)
  })
  it('applies paragraph properties across the selection as one undoable edit', () => {
    const session = createSession()
    session.execute('select.all')
    const before = session.document()
    const properties = { spaceBefore: 12, spaceAfter: 18, indentLeft: 36, firstLineIndent: -18, lineRule: 'multiple', lineSpacing: 2, direction: 'rtl', keepNext: true, widowControl: false }
    expect(session.execute('wc.paragraph', properties).ok).toBe(true)
    expect(session.document().content?.every(node => Object.entries(properties).every(([key, value]) => node.attrs?.[key] === value))).toBe(true)
    const html = session.editor.getHTML()
    expect(html).toContain('margin-top: 12pt')
    expect(html).toContain('dir="rtl"')
    const restored = generateJSON(html, extensions)
    expect(restored.content?.[0].attrs).toMatchObject(properties)
    session.execute('edit.undo')
    expect(session.document()).toEqual(before)
  })
  it('inserts page breaks without losing adjacent text, supports undo and plain native backups', () => {
    const session = createSession('<p>BeforeAfter</p>')
    session.editor.commands.setTextSelection(7)
    const before = session.document()
    expect(session.execute('insert.pageBreak').ok).toBe(true)
    expect(session.document().content?.some(node => node.type === 'pageBreak')).toBe(true)
    expect(session.editor.getText().replace(/\s/g, '')).toBe('BeforeAfter')
    expect((generateJSON(session.editor.getHTML(), extensions) as JSONContent).content?.some(node => node.type === 'pageBreak')).toBe(true)
    session.execute('edit.undo')
    expect(session.document()).toEqual(before)
  })
  it('inserts literal text, not executable HTML, and bounds multiline input', () => {
    const session = createSession()
    session.execute('select.all')
    expect(session.execute('text.insert', { text: '<img src=x onerror=bad()>\nNext', paragraphs: true }).ok).toBe(true)
    expect(session.document().content).toHaveLength(2)
    expect(session.editor.getHTML()).toContain('&lt;img')
    expect(session.execute('text.insert', { text: '\n'.repeat(10_001) }).ok).toBe(false)
  })
  it('keeps discrete formatting actions separate from each other and subsequent typing in undo history', () => {
    const session = createSession('<p>Text</p>')
    session.execute('para.indent')
    session.execute('para.indent')
    expect(session.document().content?.[0].attrs?.indentLeft).toBe(72)
    session.execute('text.insert', { text: 'More' })
    session.execute('edit.undo')
    expect(session.document().content?.[0].attrs?.indentLeft).toBe(72)
    expect(session.editor.getText()).toBe('Text')
    session.execute('edit.undo')
    expect(session.document().content?.[0].attrs?.indentLeft).toBe(36)
  })
  it('clears new paragraph and character formatting in one undoable command', () => {
    const session = createSession('<p>Text</p>')
    session.execute('select.all')
    session.execute('format.bold')
    session.execute('wc.paragraph', { spaceBefore: 12, direction: 'rtl', lineSpacing: 2 })
    const before = session.document()
    session.execute('format.clear')
    expect(session.document().content?.[0].attrs?.spaceBefore).toBeNull()
    expect(session.editor.isActive('bold')).toBe(false)
    session.execute('edit.undo')
    expect(session.document()).toEqual(before)
  })
  it('uses typing marks for scripted text insertion', () => {
    const session = createSession('<p></p>')
    session.execute('format.bold', { value: true })
    session.execute('text.insert', { text: 'Bold input' })
    expect(session.document().content?.[0].content?.[0].marks).toContainEqual({ type: 'bold' })
  })
  it('has context-sensitive table commands and supports cell merge/split with undo', () => {
    const session = createSession('<p></p>')
    expect(session.execute('table.deleteRow').ok).toBe(false)
    expect(session.execute('insert.table', { rows: 2, cols: 2 }).ok).toBe(true)
    const cells: number[] = []
    session.editor.state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') cells.push(pos) })
    session.editor.view.dispatch(session.editor.state.tr.setSelection(CellSelection.create(session.editor.state.doc, cells[0], cells[1])))
    expect(session.execute('table.merge').ok).toBe(true)
    expect(session.document().content?.[0].content?.[0].content).toHaveLength(1)
    expect(session.execute('table.split').ok).toBe(true)
    expect(session.document().content?.[0].content?.[0].content).toHaveLength(2)
  })
  it.each([null, [], 'bad', 123, { unexpected: true }, { value: 'true' }, { size: Infinity }, { left: NaN }])('rejects hostile parameters without content or history changes: %j', params => {
    const session = createSession()
    const before = session.editor.state
    for (const command of commandDefinitions) {
      const result = session.execute(command.id, params)
      expect(result.ok, `${command.id} accepted invalid parameters`).toBe(false)
      expect(session.editor.state.doc.eq(before.doc), command.id).toBe(true)
    }
  })
  it('refuses unsupported commands and read-only sessions', () => {
    const session = createSession()
    expect(session.execute('mailings.merge')).toMatchObject({ ok: false, error: { code: 'UNKNOWN_COMMAND' } })
    session.editor.setEditable(false)
    expect(session.execute('format.bold')).toMatchObject({ ok: false, error: { code: 'DISABLED' } })
  })
  it('restores document, selection and undo state if a command unexpectedly fails after editing', () => {
    const session = createSession()
    const before = session.editor.state
    const command = commandDefinitions.find(command => command.id === 'text.insert')!
    vi.spyOn(command, 'execute').mockImplementation(editor => {
      editor.commands.insertContent('Unexpected mutation')
      throw new Error('Synthetic command failure')
    })
    expect(session.execute('text.insert', { text: 'anything' })).toMatchObject({ ok: false, error: { code: 'COMMAND_FAILED' } })
    expect(session.editor.state).toBe(before)
  })
  it('provides validated programmatic requests without dialogs or a network listener', () => {
    const api = createAutomation(createSession())
    expect(api.request({ method: 'engine.commands' })).toMatchObject({ ok: true })
    expect(api.request({ method: 'engine.execute', params: { command: 'select.text', params: { text: 'beta' } } })).toMatchObject({ ok: true })
    expect(api.request({ method: 'engine.execute', params: { command: 'format.bold' } })).toMatchObject({ ok: true })
    expect(api.request({ method: 'engine.document' })).toMatchObject({ ok: true, document: { type: 'doc' } })
    expect(api.request({ method: 'file.open' })).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })
})
