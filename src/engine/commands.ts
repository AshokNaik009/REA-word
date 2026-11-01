import type { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { z } from 'zod'
import { findMatches } from '../lib/editor'
import { paragraphProperties, type ParagraphProperties } from './properties'

const empty = z.object({}).strict()
const toggle = z.object({ value: z.boolean().optional() }).strict()
const boundedPoints = z.number().finite().min(0).max(1584)
const boundedIndent = z.number().finite().min(-1584).max(1584)

function define<S extends z.ZodType>(id: string, label: string, schema: S, run: (editor: Editor, params: z.infer<S>) => boolean, preset?: z.input<S>) {
  return {
    id, label, parameters: z.toJSONSchema(schema), preset,
    execute(editor: Editor, input: unknown): boolean {
      const params = schema.parse(input)
      const ownUndoStep = !['text.insert', 'text.newParagraph', 'text.lineBreak'].includes(id) && !id.startsWith('select.') && !id.startsWith('edit.')
      if (ownUndoStep) editor.view.dispatch(closeHistory(editor.state.tr))
      const result = run(editor, params)
      if (ownUndoStep && result) editor.view.dispatch(closeHistory(editor.state.tr))
      return result
    },
  }
}

function mark(editor: Editor, type: string, value?: boolean): boolean {
  if (type === 'superscript' || type === 'subscript') {
    if (value === false || (value === undefined && editor.isActive(type))) return editor.commands.unsetMark(type)
    return editor.chain().unsetMark(type === 'superscript' ? 'subscript' : 'superscript').setMark(type).run()
  }
  return (value === undefined ? editor.chain().toggleMark(type) : value ? editor.chain().setMark(type) : editor.chain().unsetMark(type)).run()
}

export function currentParagraph(editor: Editor): ParagraphProperties {
  return editor.getAttributes(editor.isActive('heading') ? 'heading' : 'paragraph')
}

export function setParagraph(editor: Editor, update: Partial<ParagraphProperties> | ((attrs: ParagraphProperties) => Partial<ParagraphProperties>)): boolean {
  const { state } = editor
  const transaction = state.tr
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (!['paragraph', 'heading'].includes(node.type.name)) return
    if (!state.selection.empty && pos === state.selection.to) return false
    const next = { ...node.attrs, ...(typeof update === 'function' ? update(node.attrs) : update) }
    paragraphProperties.parse(next)
    transaction.setNodeMarkup(pos, undefined, next)
    return false
  })
  if (!transaction.docChanged) return false
  editor.view.dispatch(transaction)
  return true
}

function paraFlag(editor: Editor, key: 'keepNext' | 'keepLines' | 'pageBreakBefore' | 'widowControl', value?: boolean) {
  return setParagraph(editor, { [key]: value ?? !currentParagraph(editor)[key] })
}

function insertPageBreak(editor: Editor) {
  // An empty paragraph after the atomic break keeps the insertion point writable.
  return editor.chain().insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }]).run()
}

function clearFormatting(editor: Editor) {
  return editor.chain().unsetAllMarks().clearNodes().command(({ tr }) => {
    tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
      if (!['paragraph', 'heading'].includes(node.type.name)) return
      const cleared = Object.fromEntries(Object.keys(paragraphProperties.shape).map(key => [key, null]))
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...cleared, textAlign: null })
      return false
    })
    return true
  }).run()
}

export const commandDefinitions = [
  define('edit.undo', 'Undo', empty, editor => editor.commands.undo(), {}),
  define('edit.redo', 'Redo', empty, editor => editor.commands.redo(), {}),
  define('select.all', 'Select All', empty, editor => editor.commands.selectAll(), {}),
  define('select.text', 'Select Text', z.object({ text: z.string().min(1).max(10_000), occurrence: z.number().int().min(1).max(10_000).default(1) }).strict(), (editor, params) => {
    const match = findMatches(editor.state.doc, params.text, true)[params.occurrence - 1]
    return match ? editor.commands.setTextSelection(match) : false
  }),
  define('text.insert', 'Type Text', z.object({ text: z.string().max(1_000_000), paragraphs: z.boolean().default(false), raw: z.literal(true).default(true) }).strict(), (editor, params) => {
    const lines = params.text.split(/\r\n?|\n/)
    if (lines.length > 10_000) throw new Error('Text insertion is limited to 10000 lines.')
    if (!params.text) return editor.commands.deleteSelection()
    const marks = (editor.state.storedMarks ?? editor.state.selection.$from.marks()).map(mark => mark.toJSON())
    const textNode = (text: string) => ({ type: 'text', text, marks })
    const nodes = params.paragraphs
      ? lines.map(text => ({ type: 'paragraph', content: text ? [textNode(text)] : [] }))
      : lines.flatMap((text, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...(text ? [textNode(text)] : [])])
    return editor.commands.insertContent(nodes)
  }),
  define('text.newParagraph', 'New Paragraph', empty, editor => editor.commands.splitBlock(), {}),
  define('text.lineBreak', 'Line Break', empty, editor => editor.commands.setHardBreak(), {}),
  define('text.pageBreak', 'Page Break', empty, insertPageBreak, {}),
  define('insert.pageBreak', 'Insert Page Break', empty, insertPageBreak, {}),
  define('format.bold', 'Bold', toggle, (editor, params) => mark(editor, 'bold', params.value), {}),
  define('format.italic', 'Italic', toggle, (editor, params) => mark(editor, 'italic', params.value), {}),
  define('format.underline', 'Underline', toggle, (editor, params) => mark(editor, 'underline', params.value), {}),
  define('format.strikethrough', 'Strikethrough', toggle, (editor, params) => mark(editor, 'strike', params.value), {}),
  define('format.superscript', 'Superscript', toggle, (editor, params) => mark(editor, 'superscript', params.value), {}),
  define('format.subscript', 'Subscript', toggle, (editor, params) => mark(editor, 'subscript', params.value), {}),
  define('format.font', 'Font', z.object({ name: z.string().min(1).max(100).regex(/^[\p{L}\p{N} ,_-]+$/u) }).strict(), (editor, params) => editor.commands.setFontFamily(params.name)),
  define('format.size', 'Font Size', z.object({ size: z.number().finite().min(1).max(150) }).strict(), (editor, params) => editor.commands.setFontSize(`${params.size * 4 / 3}px`)),
  define('format.color', 'Font Color', z.object({ color: z.string().regex(/^#?[0-9a-f]{6}$/i) }).strict(), (editor, params) => editor.commands.setColor(`#${params.color.replace('#', '')}`)),
  define('format.highlight', 'Highlight', z.object({ color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#f7e6a4'), value: z.boolean().optional() }).strict(), (editor, params) => {
    return params.value === false ? editor.commands.unsetHighlight() : params.value === true ? editor.commands.setHighlight({ color: params.color }) : editor.commands.toggleHighlight({ color: params.color })
  }, {}),
  define('format.clear', 'Clear Formatting', empty, clearFormatting, {}),
  define('para.alignLeft', 'Align Left', empty, editor => editor.commands.setTextAlign('left'), {}),
  define('para.alignCenter', 'Align Center', empty, editor => editor.commands.setTextAlign('center'), {}),
  define('para.alignRight', 'Align Right', empty, editor => editor.commands.setTextAlign('right'), {}),
  define('para.justify', 'Justify', empty, editor => editor.commands.setTextAlign('justify'), {}),
  define('para.bullets', 'Bulleted List', empty, editor => editor.commands.toggleBulletList(), {}),
  define('para.numbering', 'Numbered List', empty, editor => editor.commands.toggleOrderedList(), {}),
  define('para.style', 'Paragraph Style', z.object({ style: z.enum(['Normal', 'Heading1', 'Heading2', 'Heading3', 'Quote']) }).strict(), (editor, params) => {
    if (params.style === 'Quote') return editor.commands.toggleBlockquote()
    return params.style === 'Normal' ? editor.commands.setParagraph() : editor.commands.setHeading({ level: Number(params.style.slice(-1)) as 1 | 2 | 3 })
  }),
  define('wc.paragraph', 'Set Paragraph Properties', paragraphProperties.strict(), (editor, params) => setParagraph(editor, params)),
  define('para.indent', 'Increase Indent', empty, editor => setParagraph(editor, attrs => ({ indentLeft: Math.min(1584, (attrs.indentLeft ?? 0) + 36) })), {}),
  define('para.outdent', 'Decrease Indent', empty, editor => setParagraph(editor, attrs => ({ indentLeft: Math.max(0, (attrs.indentLeft ?? 0) - 36) })), {}),
  define('para.indents', 'Paragraph Indents', z.object({ left: boundedIndent.optional(), right: boundedIndent.optional(), firstLine: boundedIndent.optional() }).strict().refine(value => Object.keys(value).length > 0), (editor, params) => setParagraph(editor, {
    ...(params.left !== undefined ? { indentLeft: params.left } : {}),
    ...(params.right !== undefined ? { indentRight: params.right } : {}),
    ...(params.firstLine !== undefined ? { firstLineIndent: params.firstLine } : {}),
  })),
  define('para.spacing', 'Paragraph Spacing', z.object({ before: boundedPoints.optional(), after: boundedPoints.optional() }).strict().refine(value => Object.keys(value).length > 0), (editor, params) => setParagraph(editor, {
    ...(params.before !== undefined ? { spaceBefore: params.before } : {}),
    ...(params.after !== undefined ? { spaceAfter: params.after } : {}),
  })),
  define('para.lineSpacing', 'Line Spacing', z.union([
    z.object({ value: z.number().finite().min(0.5).max(10) }).strict(),
    z.object({ exactly: z.number().finite().min(0.5).max(1584) }).strict(),
    z.object({ atLeast: z.number().finite().min(0.5).max(1584) }).strict(),
  ]), (editor, params) => setParagraph(editor, 'value' in params ? { lineRule: 'multiple', lineSpacing: params.value } : 'exactly' in params ? { lineRule: 'exactly', lineSpacing: params.exactly } : { lineRule: 'atLeast', lineSpacing: params.atLeast }), { value: 1.5 }),
  define('para.single', 'Single Spacing', empty, editor => setParagraph(editor, { lineRule: 'multiple', lineSpacing: 1 }), {}),
  define('para.double', 'Double Spacing', empty, editor => setParagraph(editor, { lineRule: 'multiple', lineSpacing: 2 }), {}),
  define('para.oneAndHalf', '1.5 Line Spacing', empty, editor => setParagraph(editor, { lineRule: 'multiple', lineSpacing: 1.5 }), {}),
  define('para.rtl', 'Right-to-Left Paragraph', toggle, (editor, params) => setParagraph(editor, { direction: params.value === false ? 'ltr' : 'rtl' }), {}),
  define('para.ltr', 'Left-to-Right Paragraph', toggle, (editor, params) => setParagraph(editor, { direction: params.value === false ? 'rtl' : 'ltr' }), {}),
  define('para.keepNext', 'Keep With Next', toggle, (editor, params) => paraFlag(editor, 'keepNext', params.value), {}),
  define('para.keepLines', 'Keep Lines Together', toggle, (editor, params) => paraFlag(editor, 'keepLines', params.value), {}),
  define('para.pageBreakBefore', 'Page Break Before', toggle, (editor, params) => paraFlag(editor, 'pageBreakBefore', params.value), {}),
  define('para.widowControl', 'Widow/Orphan Control', toggle, (editor, params) => paraFlag(editor, 'widowControl', params.value), {}),
  define('insert.table', 'Insert Table', z.object({ rows: z.number().int().min(1).max(100).default(3), cols: z.number().int().min(1).max(30).default(3), header: z.boolean().default(true) }).strict().refine(params => params.rows * params.cols <= 1000, 'Tables are limited to 1000 cells.'), (editor, params) => editor.commands.insertTable({ rows: params.rows, cols: params.cols, withHeaderRow: params.header }), {}),
  define('table.insertRowAbove', 'Insert Row Above', empty, editor => editor.commands.addRowBefore(), {}),
  define('table.insertRowBelow', 'Insert Row Below', empty, editor => editor.commands.addRowAfter(), {}),
  define('table.insertColumnLeft', 'Insert Column Left', empty, editor => editor.commands.addColumnBefore(), {}),
  define('table.insertColumnRight', 'Insert Column Right', empty, editor => editor.commands.addColumnAfter(), {}),
  define('table.deleteRow', 'Delete Row', empty, editor => editor.commands.deleteRow(), {}),
  define('table.deleteColumn', 'Delete Column', empty, editor => editor.commands.deleteColumn(), {}),
  define('table.deleteTable', 'Delete Table', empty, editor => editor.commands.deleteTable(), {}),
  define('table.merge', 'Merge Cells', empty, editor => editor.commands.mergeCells(), {}),
  define('table.split', 'Split Merged Cell', empty, editor => editor.commands.splitCell(), {}),
]
