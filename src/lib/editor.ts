import { getSchema, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Typography from '@tiptap/extension-typography'
import DOMPurify from 'dompurify'
import { isLocalImage, isSafeLink } from './document'

export const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: false, protocols: ['http', 'https', 'mailto'], isAllowedUri: url => isSafeLink(url) },
  }),
  TextStyleKit,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({ multicolor: true }),
  Image.configure({ allowBase64: true }),
  TableKit.configure({ table: { resizable: false } }),
  Placeholder.configure({ placeholder: 'A new thought starts here...' }),
  CharacterCount,
  Typography,
]

export function validateContent(content: JSONContent): void {
  const schema = getSchema(extensions)
  schema.nodeFromJSON(content).check()
}

export function sanitizeHTML(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'object', 'form', 'input', 'video', 'audio'],
    FORBID_ATTR: ['srcset', 'background'],
  })
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  doc.querySelectorAll('img').forEach(img => { if (!isLocalImage(img.getAttribute('src') ?? '')) img.remove() })
  doc.querySelectorAll('a').forEach(link => { if (!isSafeLink(link.getAttribute('href') ?? '')) link.removeAttribute('href') })
  // Imported style URLs must never trigger background/font network requests.
  doc.querySelectorAll('[style]').forEach(element => {
    const style = element.getAttribute('style') ?? ''
    if (/url\s*\(|@import|expression\s*\(/i.test(style)) element.removeAttribute('style')
  })
  return doc.body.innerHTML
}

export interface SearchMatch { from: number; to: number }

export function findMatches(doc: import('@tiptap/pm/model').Node, query: string): SearchMatch[] {
  if (!query) return []
  const matches: SearchMatch[] = []
  const needle = query.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return
    // Index the full text block so matches can cross bold/italic run boundaries.
    let text = ''
    const positions: number[] = []
    node.descendants((child, offset) => {
      if (child.isText) {
        const part = child.text ?? ''
        text += part
        for (let i = 0; i < part.length; i++) positions.push(pos + 1 + offset + i)
      } else if (child.isLeaf) {
        text += '\u0000'
        positions.push(pos + 1 + offset)
      }
    })
    const haystack = text.toLowerCase()
    let index = 0
    while ((index = haystack.indexOf(needle, index)) !== -1 && matches.length < 10_000) {
      const from = positions[index]
      const end = positions[index + needle.length - 1]
      if (from !== undefined && end !== undefined) matches.push({ from, to: end + 1 })
      index += Math.max(1, needle.length)
    }
    return false
  })
  return matches
}
