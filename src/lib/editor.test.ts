import { getSchema } from '@tiptap/react'
import { describe, expect, it } from 'vitest'
import { extensions, findMatches, sanitizeHTML, validateContent } from './editor'

describe('safe editing', () => {
  it('strips scripts, event handlers, remote images, frames and CSS URLs', () => {
    const clean = sanitizeHTML('<p onclick="bad()" style="background:url(https://tracker.test)">Hello<script>bad()</script></p><img src="https://tracker.test/a"><iframe src="https://tracker.test"></iframe><a href="javascript:bad()">link</a>')
    expect(clean).toContain('Hello')
    expect(clean).not.toMatch(/script|onclick|tracker|iframe|javascript|url\(/)
  })
  it('keeps useful formatting and embedded PNG images', () => {
    const clean = sanitizeHTML('<h2>Title</h2><p><strong>Bold</strong><a href="https://example.com">Link</a></p><img src="data:image/png;base64,aGVsbG8=">')
    expect(clean).toContain('<strong>Bold</strong>')
    expect(clean).toContain('data:image/png;base64,')
    expect(clean).toContain('https://example.com')
  })
  it('finds text across formatting boundaries and treats regexp characters literally', () => {
    const schema = getSchema(extensions)
    const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'WORLD. [hi]' }] }] })
    const matches = findMatches(doc, 'hello world')
    expect(matches).toEqual([{ from: 1, to: 12 }])
    expect(doc.textBetween(matches[0].from, matches[0].to)).toBe('Hello WORLD')
    expect(findMatches(doc, '[hi]')).toHaveLength(1)
    expect(findMatches(doc, '')).toEqual([])
  })
  it('does not match across paragraph or hard-break boundaries', () => {
    const schema = getSchema(extensions)
    const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'c' }] }] })
    expect(findMatches(doc, 'ab')).toEqual([])
    expect(findMatches(doc, 'bc')).toEqual([])
  })
  it('rejects structurally invalid editor content', () => {
    expect(() => validateContent({ type: 'doc', content: [{ type: 'text', text: 'not a block' }] })).toThrow()
  })
})
