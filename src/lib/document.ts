import type { JSONContent } from '@tiptap/react'
import { z } from 'zod'
import { paragraphProperties } from '../engine/properties'

export const MAX_FILE_BYTES = 20 * 1024 * 1024
const nodeTypes = new Set(['doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock', 'horizontalRule', 'hardBreak', 'pageBreak', 'table', 'tableRow', 'tableCell', 'tableHeader', 'image'])
const markTypes = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link', 'textStyle', 'highlight', 'superscript', 'subscript'])

export function isSafeLink(url: string): boolean {
  return /^(https?:\/\/|mailto:|#)/i.test(url.trim())
}

export function isLocalImage(src: string): boolean {
  return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)
}

export function isEditorContent(value: unknown): value is JSONContent {
  if (!value || typeof value !== 'object' || (value as JSONContent).type !== 'doc') return false
  const stack = [{ value, depth: 0 }]
  let count = 0
  while (stack.length) {
    const item = stack.pop()!
    if (++count > 50_000 || item.depth > 40 || !item.value || typeof item.value !== 'object') return false
    const node = item.value as JSONContent
    if (!node.type || !nodeTypes.has(node.type)) return false
    if (['paragraph', 'heading'].includes(node.type) && !paragraphProperties.safeParse(node.attrs ?? {}).success) return false
    if (node.text !== undefined && (typeof node.text !== 'string' || node.text.length > 5_000_000)) return false
    if (node.type === 'image' && !isLocalImage(String(node.attrs?.src ?? ''))) return false
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks) || node.marks.length > 20) return false
      for (const mark of node.marks) {
        if (!markTypes.has(mark.type)) return false
        if (mark.type === 'link' && !isSafeLink(String(mark.attrs?.href ?? ''))) return false
      }
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) return false
      for (const child of node.content) stack.push({ value: child, depth: item.depth + 1 })
    }
  }
  return true
}

export const pageSchema = z.object({
  size: z.enum(['A4', 'Letter']),
  orientation: z.enum(['portrait', 'landscape']),
  margins: z.enum(['normal', 'narrow', 'wide']),
})

export const documentSchema = z.object({
  format: z.literal('wordcraft'),
  version: z.union([z.literal(1), z.literal(2)]).transform(() => 2 as const),
  id: z.string().min(1).max(100),
  title: z.string().max(200),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  page: pageSchema,
  content: z.custom<JSONContent>(isEditorContent, 'Invalid or unsupported document content'),
})

export type CraftDocument = z.infer<typeof documentSchema>
export type PageSettings = CraftDocument['page']
export type ExportFormat = 'wordcraft' | 'docx' | 'html' | 'txt'

export function createDocument(title = 'Untitled document', content: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }): CraftDocument {
  const now = new Date().toISOString()
  return { format: 'wordcraft', version: 2, id: crypto.randomUUID(), title, createdAt: now, updatedAt: now, page: { size: 'A4', orientation: 'portrait', margins: 'normal' }, content }
}

export function parseDocument(text: string): CraftDocument {
  if (text.length > MAX_FILE_BYTES) throw new Error('This document is too large. The limit is 20 MB.')
  return documentSchema.parse(JSON.parse(text))
}

export function pageDimensions(page: PageSettings): { width: number; height: number; margin: number } {
  const [short, long] = page.size === 'A4' ? [794, 1123] : [816, 1056]
  return {
    width: page.orientation === 'portrait' ? short : long,
    height: page.orientation === 'portrait' ? long : short,
    margin: { normal: 76, narrow: 42, wide: 100 }[page.margins],
  }
}

export function filename(title: string): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/, '').trim().slice(0, 120) || 'Untitled document'
}

export function textContent(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'pageBreak') return '\f'
  const separator = ['doc', 'table', 'tableRow', 'bulletList', 'orderedList', 'blockquote'].includes(node.type ?? '') ? '\n' : ''
  return (node.content ?? []).map(textContent).join(separator)
}

export const sampleDocument = () => createDocument('The thoughtful workspace', {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'FIELD NOTES  /  NO. 001', marks: [{ type: 'textStyle', attrs: { color: '#527c70', fontSize: '11px', fontFamily: 'Verdana' } }] }] },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'A little room for big ideas.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'On making space for the work that matters.', marks: [{ type: 'italic' }, { type: 'textStyle', attrs: { color: '#737b73', fontSize: '20px' } }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Every good idea starts somewhere. A note in the margin. A conversation that stays with you. A blank page, patiently waiting for the first sentence.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'This is a space for those beginnings. ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'Not another place to keep up, but a place to slow down, think clearly, and put something into the world.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Make room for the messy middle' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'The first draft is not a promise. It is an invitation to see what you think. Leave the polished edges for later; for now, follow the thread.' }] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You do not need the whole story. You just need the next honest sentence.' }] }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A few things worth remembering' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start small. ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'A paragraph is a perfectly good beginning.' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stay curious. ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'The interesting part is often the unexpected one.' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Make it yours. ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'Choose a style, add a table, or simply keep writing.' }] }] },
    ] },
    { type: 'horizontalRule' },
    { type: 'paragraph', content: [{ type: 'text', text: 'Your words stay on this device. Your next chapter starts here.', marks: [{ type: 'italic' }, { type: 'textStyle', attrs: { color: '#7d837a', fontSize: '13px' } }] }] },
  ],
})
