import { useEditorState, type Editor } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDownToLine, Bold, ChevronDown,
  FilePlus2, Focus, Highlighter, ImagePlus, Italic, Link2, List, ListOrdered,
  Minus, Pilcrow, Printer, Quote, Redo2, Search, Strikethrough, Table2, Type, Underline, Undo2,
  Plus, Trash2, Columns3, Rows3, Superscript, Subscript,
} from 'lucide-react'
import type { CraftDocument, PageSettings } from '../lib/document'
import { IconButton, ToolGroup } from './Button'

export type RibbonTab = 'Home' | 'Insert' | 'Layout' | 'View'

interface RibbonProps {
  editor: Editor
  execute: (id: string, params?: unknown) => boolean
  onParagraph: () => void
  tab: RibbonTab
  document: CraftDocument
  onPageChange: (page: PageSettings) => void
  onLink: () => void
  onImage: () => void
  onFind: () => void
  onNew: () => void
  onOpen: () => void
  onExport: () => void
  onPrint: () => void
  focus: boolean
  onFocus: () => void
  showMarks: boolean
  onMarks: () => void
}

export function Ribbon(props: RibbonProps) {
  const { editor, tab } = props
  const state = useEditorState({ editor, selector: ({ editor: e }) => ({
    bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'),
    strike: e.isActive('strike'), highlight: e.isActive('highlight'), link: e.isActive('link'),
    superscript: e.isActive('superscript'), subscript: e.isActive('subscript'),
    bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), table: e.isActive('table'),
    align: ['left', 'center', 'right', 'justify'].find(value => e.isActive({ textAlign: value })) ?? 'left',
    heading: e.isActive('heading') ? e.getAttributes('heading').level : 0,
    font: e.getAttributes('textStyle').fontFamily ?? 'Georgia',
    size: e.getAttributes('textStyle').fontSize ?? '16px',
    color: e.getAttributes('textStyle').color ?? '#293c35',
    undo: e.can().undo(), redo: e.can().redo(),
  }) })
  const run = () => editor.chain().focus()
  const execute = (id: string, params: unknown = {}) => { props.execute(id, params); editor.commands.focus() }
  return <section className="ribbon" aria-label={`${tab} tools`} onMouseDown={event => { if ((event.target as HTMLElement).closest('button')) event.preventDefault() }}>
    {tab === 'Home' && <>
      <ToolGroup label="History"><div className="tool-row"><IconButton icon={Undo2} label="Undo (Cmd/Ctrl+Z)" disabled={!state.undo} onClick={() => execute('edit.undo')} /><IconButton icon={Redo2} label="Redo (Cmd/Ctrl+Shift+Z)" disabled={!state.redo} onClick={() => execute('edit.redo')} /></div><button className="text-tool" onClick={props.onNew}><FilePlus2 size={15} />New page</button></ToolGroup>
      <ToolGroup label="Font" className="font-group">
        <div className="tool-row">
          <select aria-label="Font family" value={state.font} onChange={event => execute('format.font', { name: event.target.value })}>
            {['Georgia', 'Verdana', 'Palatino', 'Trebuchet MS', 'Courier New'].map(font => <option key={font}>{font}</option>)}
          </select>
          <select aria-label="Font size" className="font-size" value={state.size} onChange={event => execute('format.size', { size: parseFloat(event.target.value) * 0.75 })}>
            {!['12px', '14px', '16px', '18px', '20px', '24px', '28px', '36px', '48px'].includes(state.size) && <option>{state.size}</option>}
            {[12, 14, 16, 18, 20, 24, 28, 36, 48].map(size => <option key={size} value={`${size}px`}>{size}</option>)}
          </select>
        </div>
        <div className="tool-row">
          <IconButton icon={Bold} label="Bold (Cmd/Ctrl+B)" active={state.bold} onClick={() => execute('format.bold')} />
          <IconButton icon={Italic} label="Italic (Cmd/Ctrl+I)" active={state.italic} onClick={() => execute('format.italic')} />
          <IconButton icon={Underline} label="Underline (Cmd/Ctrl+U)" active={state.underline} onClick={() => execute('format.underline')} />
          <IconButton icon={Strikethrough} label="Strikethrough" active={state.strike} onClick={() => execute('format.strikethrough')} />
          <IconButton icon={Superscript} label="Superscript" active={state.superscript} onClick={() => execute('format.superscript')} />
          <IconButton icon={Subscript} label="Subscript" active={state.subscript} onClick={() => execute('format.subscript')} />
          <span className="tool-divider" />
          <IconButton icon={Highlighter} label="Highlight" active={state.highlight} onClick={() => execute('format.highlight')} />
          <label className="color-tool" title="Text color"><Type size={18} /><span style={{ backgroundColor: state.color }} /><input type="color" aria-label="Text color" value={/^#[0-9a-f]{6}$/i.test(state.color) ? state.color : '#293c35'} onChange={event => execute('format.color', { color: event.target.value })} /></label>
        </div>
      </ToolGroup>
      <ToolGroup label="Paragraph">
        <div className="tool-row"><IconButton icon={List} label="Bulleted list" active={state.bullet} onClick={() => execute('para.bullets')} /><IconButton icon={ListOrdered} label="Numbered list" active={state.ordered} onClick={() => execute('para.numbering')} /><IconButton icon={Quote} label="Block quote" active={editor.isActive('blockquote')} onClick={() => execute('para.style', { style: 'Quote' })} /><IconButton icon={Pilcrow} label="Show paragraph marks" active={props.showMarks} onClick={props.onMarks} /></div>
        <div className="tool-row">{([{ value: 'left', icon: AlignLeft, command: 'para.alignLeft' }, { value: 'center', icon: AlignCenter, command: 'para.alignCenter' }, { value: 'right', icon: AlignRight, command: 'para.alignRight' }, { value: 'justify', icon: AlignJustify, command: 'para.justify' }] as const).map(({ value, icon, command }) => <IconButton key={value} icon={icon} label={`Align ${value}`} active={state.align === value} onClick={() => execute(command)} />)}</div>
      </ToolGroup>
      <ToolGroup label="Styles" className="styles-group">
        <div className="style-gallery">{[{ level: 0, label: 'Normal', preview: 'Aa', className: 'normal' }, { level: 1, label: 'Title', preview: 'Aa', className: 'title' }, { level: 2, label: 'Heading 2', preview: 'Aa', className: 'heading' }, { level: 3, label: 'Heading 3', preview: 'Aa', className: 'small-heading' }].map(style => <button key={style.level} className={`style-card ${style.className} ${state.heading === style.level ? 'selected' : ''}`} onClick={() => execute('para.style', { style: style.level === 0 ? 'Normal' : `Heading${style.level}` })}><span>{style.preview}</span><small>{style.label}</small></button>)}</div>
      </ToolGroup>
      <ToolGroup label="Editing"><button className="text-tool" onClick={props.onFind}><Search size={16} />Find & replace</button><button className="text-tool" onClick={() => execute('format.clear')}><Type size={16} />Clear formatting</button><button className="text-tool" onClick={props.onParagraph}>Paragraph settings</button></ToolGroup>
    </>}
    {tab === 'Insert' && <>
      <ToolGroup label="Pages"><button className="large-tool" onClick={() => execute('insert.pageBreak')}><FilePlus2 /><span>Page break</span><small>Cmd/Ctrl Enter</small></button></ToolGroup>
      <ToolGroup label="Elements"><div className="insert-tools"><button className="large-tool" onClick={() => execute('insert.table')}><Table2 /><span>Table</span><small>3 x 3</small></button><button className="large-tool" onClick={props.onImage}><ImagePlus /><span>Picture</span><small>From device</small></button><button className="large-tool" onClick={props.onLink}><Link2 /><span>Link</span><small>Web or email</small></button><button className="large-tool" onClick={() => run().setHorizontalRule().run()}><Minus /><span>Divider</span><small>Horizontal rule</small></button></div></ToolGroup>
      <ToolGroup label="Writing"><button className="text-tool" onClick={() => run().toggleBlockquote().run()}><Quote size={17} />Block quote</button><button className="text-tool" onClick={() => run().insertContent(new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date())).run()}><Plus size={17} />Today's date</button></ToolGroup>
      <ToolGroup label={state.table ? 'Edit selected table' : 'Select a table to edit'}><div className="tool-row"><button className="text-tool" disabled={!state.table} onClick={() => execute('table.insertRowBelow')}><Rows3 size={16} />Add row</button><button className="text-tool" disabled={!state.table} onClick={() => execute('table.insertColumnRight')}><Columns3 size={16} />Add column</button></div><div className="tool-row"><button className="text-tool" disabled={!state.table} onClick={() => execute('table.deleteRow')}>Remove row</button><button className="text-tool" disabled={!state.table} onClick={() => execute('table.deleteTable')}><Trash2 size={15} />Remove table</button></div><div className="tool-row"><button className="text-tool" disabled={!state.table || !editor.can().mergeCells()} onClick={() => execute('table.merge')}>Merge cells</button><button className="text-tool" disabled={!state.table || !editor.can().splitCell()} onClick={() => execute('table.split')}>Split cell</button><button className="text-tool" disabled={!state.table} onClick={() => execute('table.deleteColumn')}>Remove column</button></div></ToolGroup>
    </>}
    {tab === 'Layout' && <>
      <ToolGroup label="Paragraph"><button className="text-tool" onClick={props.onParagraph}>Paragraph settings</button><div className="tool-row"><button className="text-tool" onClick={() => execute('para.indent')}>Indent +</button><button className="text-tool" onClick={() => execute('para.outdent')}>Indent -</button></div></ToolGroup>
      <ToolGroup label="Paper size"><select aria-label="Paper size" value={props.document.page.size} onChange={event => props.onPageChange({ ...props.document.page, size: event.target.value as PageSettings['size'] })}><option>A4</option><option>Letter</option></select><small className="tool-note">Applies to DOCX and print</small></ToolGroup>
      <ToolGroup label="Orientation"><select aria-label="Page orientation" value={props.document.page.orientation} onChange={event => props.onPageChange({ ...props.document.page, orientation: event.target.value as PageSettings['orientation'] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></ToolGroup>
      <ToolGroup label="Margins"><select aria-label="Page margins" value={props.document.page.margins} onChange={event => props.onPageChange({ ...props.document.page, margins: event.target.value as PageSettings['margins'] })}><option value="normal">Normal</option><option value="narrow">Narrow</option><option value="wide">Wide</option></select></ToolGroup>
      <div className="ribbon-tip"><span className="tip-number">Aa</span><p>A little breathing room.<br /><small>Set the page, then make it your own.</small></p></div>
    </>}
    {tab === 'View' && <>
      <ToolGroup label="Workspace"><button className="large-tool" onClick={props.onFocus}><Focus /><span>{props.focus ? 'Exit focus' : 'Focus mode'}</span><small>Just you and the page</small></button></ToolGroup>
      <ToolGroup label="Proofing"><button className="text-tool" onClick={props.onMarks}><Pilcrow size={18} />{props.showMarks ? 'Hide' : 'Show'} paragraph marks</button><small className="tool-note">Spelling uses your browser / OS dictionary.</small></ToolGroup>
      <ToolGroup label="Output"><div className="tool-row"><button className="large-tool" onClick={props.onPrint}><Printer /><span>Print / PDF</span><small>System print dialog</small></button><button className="large-tool" onClick={props.onExport}><ArrowDownToLine /><span>Export</span><small>Take your words with you</small></button></div></ToolGroup>
    </>}
    <ChevronDown className="ribbon-chevron" size={13} />
  </section>
}
