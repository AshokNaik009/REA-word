import { describe, expect, it } from 'vitest'
import { createDocument, filename, isEditorContent, isLocalImage, isSafeLink, pageDimensions, parseDocument, sampleDocument, textContent } from './document'
import { validateContent } from './editor'

describe('document model', () => {
  it('creates independent, valid documents', () => {
    const a = createDocument()
    const b = createDocument()
    expect(a.id).not.toBe(b.id)
    expect(parseDocument(JSON.stringify(a))).toEqual(a)
    expect(() => validateContent(a.content)).not.toThrow()
  })
  it('validates the complete sample against the editor schema', () => {
    const doc = sampleDocument()
    expect(parseDocument(JSON.stringify(doc))).toEqual(doc)
    expect(() => validateContent(doc.content)).not.toThrow()
    expect(textContent(doc.content)).toContain('A little room for big ideas.')
  })
  it.each(['{"version":2}', 'null', '{broken', '[]'])('rejects invalid document %s', text => {
    expect(() => parseDocument(text)).toThrow()
  })
  it('rejects future versions without rewriting them', () => {
    expect(() => parseDocument(JSON.stringify({ ...createDocument(), version: 3 }))).toThrow()
  })
  it('rejects unknown node types and deeply nested content', () => {
    expect(isEditorContent({ type: 'doc', content: [{ type: 'iframe' }] })).toBe(false)
    let nested: unknown = { type: 'paragraph' }
    for (let i = 0; i < 50; i++) nested = { type: 'blockquote', content: [nested] }
    expect(isEditorContent({ type: 'doc', content: [nested] })).toBe(false)
  })
  it('rejects network images, SVG images and script links in document JSON', () => {
    expect(isEditorContent({ type: 'doc', content: [{ type: 'image', attrs: { src: 'https://tracker.test/a.png' } }] })).toBe(false)
    expect(isLocalImage('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isEditorContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] })).toBe(false)
  })
  it.each(['https://example.com', 'http://localhost', 'mailto:hello@example.com', '#chapter'])('accepts safe link %s', url => {
    expect(isSafeLink(url)).toBe(true)
  })
  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hello', '//example.com'])('rejects unsafe link %s', url => {
    expect(isSafeLink(url)).toBe(false)
  })
  it('calculates page dimensions and rotates landscape', () => {
    expect(pageDimensions({ size: 'A4', orientation: 'portrait', margins: 'normal' })).toEqual({ width: 794, height: 1123, margin: 76 })
    expect(pageDimensions({ size: 'Letter', orientation: 'landscape', margins: 'wide' })).toEqual({ width: 1056, height: 816, margin: 100 })
  })
  it('normalizes filenames', () => {
    expect(filename('my / doc: title?')).toBe('my  doc title')
    expect(filename('  ... ')).toBe('Untitled document')
  })
  it('does not lose line breaks in plain-text export', () => {
    expect(textContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }, { type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] }] })).toBe('First\n\nThird')
  })
})
