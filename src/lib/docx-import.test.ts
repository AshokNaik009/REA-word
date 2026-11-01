import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createDocument, isEditorContent, parseDocument } from './document'
import { exportDocx } from './docx'
import { importFile } from './files'
import { readDocxMainXML, restoreDocxProperties } from './docx-import'

describe('paragraph and page-break file exchange', () => {
  it('migrates version 1 backups and rejects unsupported future versions', () => {
    const legacy = { ...createDocument('Legacy'), version: 1 }
    expect(parseDocument(JSON.stringify(legacy))).toMatchObject({ title: 'Legacy', version: 2, content: legacy.content })
    expect(() => parseDocument(JSON.stringify({ ...legacy, version: 3 }))).toThrow()
  })
  it('exports supported properties into OOXML and restores them with superscript/subscript and page breaks', async () => {
    const attrs = { spaceBefore: 12, spaceAfter: 6, indentLeft: 36, indentRight: 12, firstLineIndent: -18, lineSpacing: 1.5, lineRule: 'multiple', direction: 'rtl', keepNext: true, keepLines: true, pageBreakBefore: true, widowControl: false }
    const document = createDocument('Round trip', { type: 'doc', content: [
      { type: 'paragraph', attrs, content: [{ type: 'text', text: 'Equation ' }, { type: 'text', text: '2', marks: [{ type: 'superscript' }] }, { type: 'text', text: 'H', marks: [{ type: 'subscript' }] }] },
      { type: 'pageBreak' },
      { type: 'paragraph', content: [{ type: 'text', text: 'After the break' }] },
    ] })
    const bytes = await exportDocx(document)
    const xml = readDocxMainXML(bytes)
    expect(xml).toContain('w:line="360"')
    expect(xml).toContain('w:hanging="360"')
    expect(xml).toContain('w:type="page"')
    expect(xml).toContain('w:val="superscript"')
    const restored = await importFile({ name: 'roundtrip.docx', bytes })
    expect(restored.warning).toContain('were mapped')
    expect(restored.document.content.content?.[0].attrs).toMatchObject(attrs)
    expect(JSON.stringify(restored.document.content)).toContain('"superscript"')
    expect(JSON.stringify(restored.document.content)).toContain('"subscript"')
    expect(restored.document.content.content?.some(node => node.type === 'pageBreak')).toBe(true)
    expect(JSON.stringify(restored.document.content)).toContain('After the break')
  })
  it.each(['exactly', 'atLeast'])('round trips %s line spacing in points', async rule => {
    const document = createDocument('Spacing', { type: 'doc', content: [{ type: 'paragraph', attrs: { lineRule: rule, lineSpacing: 24 }, content: [{ type: 'text', text: 'A line' }] }] })
    const restored = await importFile({ name: 'spacing.docx', bytes: await exportDocx(document) })
    expect(restored.document.content.content?.[0].attrs).toMatchObject({ lineRule: rule, lineSpacing: 24 })
  })
  it('refuses invalid native paragraph properties instead of feeding hostile styles to the renderer', () => {
    expect(isEditorContent({ type: 'doc', content: [{ type: 'paragraph', attrs: { lineSpacing: Infinity } }] })).toBe(false)
    for (const attrs of [{ lineSpacing: 'Infinity' }, { spaceBefore: 'url(https://tracker.test)' }, { direction: 'sideways' }, { keepNext: 'true' }, { indentLeft: -99999 }]) {
      expect(() => parseDocument(JSON.stringify(createDocument('Unsafe', { type: 'doc', content: [{ type: 'paragraph', attrs }] })))).toThrow()
    }
  })
  it('does not apply properties to different paragraphs after a lossy conversion', () => {
    const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:spacing w:before="240"/></w:pPr><w:r><w:t>Original</w:t></w:r></w:p></w:body></w:document>'
    const restored = restoreDocxProperties('<p>Different</p>', xml)
    expect(restored.mapped).toBe(false)
    expect(restored.html).not.toContain('data-wc-space-before')
  })
  it('bounds actual decompressed content before the DOCX converter sees a ZIP bomb', () => {
    const bytes = zipSync({ 'word/document.xml': new Uint8Array(9 * 1024 * 1024).fill(65) })
    expect(() => readDocxMainXML(bytes)).toThrow('8 MB')
  })
  it('rejects incomplete archives and XML entity declarations', () => {
    expect(() => readDocxMainXML(new Uint8Array([1, 2, 3]))).toThrow()
    const bytes = zipSync({ 'word/document.xml': strToU8('<!DOCTYPE x [<!ENTITY x "boom">]><x>&x;</x>') })
    expect(() => readDocxMainXML(bytes)).toThrow('entity declarations')
  })
})
