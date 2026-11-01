import type { JSONContent } from '@tiptap/react'
import {
  AlignmentType, Document, ExternalHyperlink, HeadingLevel, ImageRun,
  LevelFormat, LineRuleType, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
  type IParagraphOptions, type IRunOptions, type INumberingOptions,
} from 'docx'
import { isLocalImage, isSafeLink, pageDimensions, textContent, type CraftDocument } from './document'

function color(value: unknown): string | undefined {
  const text = String(value ?? '').replace('#', '')
  if (/^[0-9a-f]{6}$/i.test(text)) return text
  if (/^[0-9a-f]{3}$/i.test(text)) return text.split('').map(char => char + char).join('')
  const rgb = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(String(value))
  return rgb ? rgb.slice(1).map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('') : undefined
}

function runOptions(node: JSONContent): IRunOptions {
  const options: { -readonly [Key in keyof IRunOptions]: IRunOptions[Key] } = { text: node.text ?? '' }
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') options.bold = true
    if (mark.type === 'italic') options.italics = true
    if (mark.type === 'underline') options.underline = {}
    if (mark.type === 'strike') options.strike = true
    if (mark.type === 'superscript') options.superScript = true
    if (mark.type === 'subscript') options.subScript = true
    if (mark.type === 'code') options.font = 'Courier New'
    if (mark.type === 'highlight') options.highlight = 'yellow'
    if (mark.type === 'textStyle') {
      options.color = color(mark.attrs?.color)
      if (mark.attrs?.fontFamily) options.font = String(mark.attrs.fontFamily)
      const size = parseFloat(String(mark.attrs?.fontSize ?? ''))
      if (Number.isFinite(size)) options.size = Math.max(2, Math.min(300, size * 1.5))
    }
  }
  return options
}

function inline(nodes: JSONContent[] = []): (TextRun | ExternalHyperlink | ImageRun)[] {
  return nodes.flatMap<TextRun | ExternalHyperlink | ImageRun>(node => {
    if (node.type === 'hardBreak') return [new TextRun({ break: 1 })]
    if (node.type === 'image') {
      const src = String(node.attrs?.src ?? '')
      if (!isLocalImage(src)) return []
      const [prefix, base64] = src.split(',')
      const type = prefix.includes('png') ? 'png' : prefix.includes('gif') ? 'gif' : prefix.includes('webp') ? undefined : 'jpg'
      if (!type) return [new TextRun('[WebP image: export as PNG or JPEG for DOCX]')]
      const width = Number(node.attrs?.width) || 480
      const height = Number(node.attrs?.height) || 300
      return [new ImageRun({
        type, data: Uint8Array.from(atob(base64), char => char.charCodeAt(0)),
        transformation: { width: Math.max(1, Math.min(900, width)), height: Math.max(1, Math.min(1200, height)) },
        altText: { name: String(node.attrs?.alt ?? 'Image'), title: 'Image', description: String(node.attrs?.alt ?? '') },
      })]
    }
    if (node.type !== 'text') return []
    const run = new TextRun(runOptions(node))
    const link = node.marks?.find(mark => mark.type === 'link')?.attrs?.href
    return link && isSafeLink(String(link)) && !String(link).startsWith('#')
      ? [new ExternalHyperlink({ link: String(link), children: [run] })]
      : [run]
  })
}

export async function exportDocx(doc: CraftDocument): Promise<Uint8Array> {
  let listId = 0
  const numbering: Array<INumberingOptions['config'][number]> = []

  function blocks(nodes: JSONContent[] = [], list?: { reference: string; level: number }): (Paragraph | Table)[] {
    const output: (Paragraph | Table)[] = []
    let listConsumed = false
    for (const node of nodes) {
      if (node.type === 'bulletList' || node.type === 'orderedList') {
        const level = Math.min(8, list ? list.level + 1 : 0)
        const reference = `list-${++listId}`
        numbering.push({
          reference,
          levels: Array.from({ length: 9 }, (_, index) => ({
            level: index,
            format: node.type === 'bulletList' ? LevelFormat.BULLET : LevelFormat.DECIMAL,
            text: node.type === 'bulletList' ? '\u2022' : `%${index + 1}.`,
            start: Number(node.attrs?.start) || 1,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 480 * (index + 1), hanging: 240 } } },
          })),
        })
        for (const item of node.content ?? []) output.push(...blocks(item.content, { reference, level }))
      } else if (node.type === 'table') {
        output.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: (node.content ?? []).map(row => new TableRow({
            children: (row.content ?? []).map(cell => {
              const children = blocks(cell.content)
              return new TableCell({
                children: children.length ? children : [new Paragraph('')],
                columnSpan: Math.max(1, Math.min(50, Number(cell.attrs?.colspan) || 1)),
                shading: cell.type === 'tableHeader' ? { fill: 'EDF3EF' } : undefined,
              })
            }),
          })),
        }))
      } else if (node.type === 'blockquote') {
        output.push(...blocks(node.content).map(block => block))
      } else if (node.type === 'image') {
        output.push(new Paragraph({ children: inline([node]) }))
      } else if (node.type === 'horizontalRule') {
        output.push(new Paragraph({ thematicBreak: true }))
      } else if (node.type === 'pageBreak') {
        output.push(new Paragraph({ children: [new PageBreak()] }))
      } else {
        const align = String(node.attrs?.textAlign ?? 'left')
        const attrs = node.attrs ?? {}
        const toTwips = (value: unknown) => value == null ? undefined : Math.round(Number(value) * 20)
        const lineRule = attrs.lineRule === 'exactly' ? LineRuleType.EXACT : attrs.lineRule === 'atLeast' ? LineRuleType.AT_LEAST : LineRuleType.AUTO
        const options: IParagraphOptions = {
          children: node.type === 'codeBlock' ? [new TextRun({ text: textContent(node), font: 'Courier New' })] : inline(node.content),
          heading: node.type === 'heading' ? ({ 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 }[Number(node.attrs?.level)] ?? HeadingLevel.HEADING_1) : undefined,
          alignment: { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED }[align],
          spacing: {
            before: toTwips(attrs.spaceBefore), after: toTwips(attrs.spaceAfter) ?? 180,
            line: attrs.lineSpacing == null ? 320 : Math.round(Number(attrs.lineSpacing) * (lineRule === LineRuleType.AUTO ? 240 : 20)),
            lineRule,
          },
          indent: {
            left: toTwips(attrs.indentLeft), right: toTwips(attrs.indentRight),
            firstLine: Number(attrs.firstLineIndent) > 0 ? toTwips(attrs.firstLineIndent) : undefined,
            hanging: Number(attrs.firstLineIndent) < 0 ? toTwips(-Number(attrs.firstLineIndent)) : undefined,
          },
          bidirectional: attrs.direction == null ? undefined : attrs.direction === 'rtl',
          keepNext: attrs.keepNext ?? undefined,
          keepLines: attrs.keepLines ?? undefined,
          pageBreakBefore: attrs.pageBreakBefore ?? undefined,
          widowControl: attrs.widowControl ?? undefined,
          numbering: list && !listConsumed ? { reference: list.reference, level: list.level } : undefined,
        }
        output.push(new Paragraph(options))
        listConsumed = true
      }
    }
    return output
  }

  const children = blocks(doc.content.content)
  const dimensions = pageDimensions(doc.page)
  const file = new Document({
    title: doc.title,
    creator: 'Wordcraft Desktop',
    styles: {
      default: { document: { run: { font: 'Georgia', size: 24, color: '293C35' } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { size: 56, color: '174F48' }, paragraph: { spacing: { before: 240, after: 240 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { size: 34, color: '174F48' }, paragraph: { spacing: { before: 280, after: 160 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', run: { size: 28, bold: true, color: '174F48' } },
      ],
    },
    numbering: { config: numbering },
    sections: [{
      properties: {
        page: {
          size: { width: Math.round(dimensions.width * 15), height: Math.round(dimensions.height * 15) },
          margin: { top: dimensions.margin * 15, bottom: dimensions.margin * 15, left: dimensions.margin * 15, right: dimensions.margin * 15 },
        },
      },
      children,
    }],
  })
  return Packer.pack(file, 'uint8array')
}
