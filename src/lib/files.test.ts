import { describe, expect, it } from 'vitest'
import { createDocument, MAX_FILE_BYTES, sampleDocument } from './document'
import { exportBytes, importFile } from './files'

describe('document files', () => {
  it('round trips the native format with a fresh id on import', async () => {
    const doc = sampleDocument()
    const exported = await exportBytes(doc, 'wordcraft', '')
    const imported = await importFile({ name: 'example.wordcraft', bytes: exported.bytes })
    expect(imported.document.id).not.toBe(doc.id)
    expect(imported.document.content).toEqual(doc.content)
    expect(imported.document.page).toEqual(doc.page)
  })
  it('imports plain text literally, including HTML-like strings and empty lines', async () => {
    const result = await importFile({ name: 'notes.txt', bytes: new TextEncoder().encode('<script>hello</script>\n\nlast') })
    expect(result.document.title).toBe('notes')
    expect(result.document.content.content).toHaveLength(3)
    expect(result.document.content.content?.[0].content?.[0].text).toBe('<script>hello</script>')
  })
  it('sanitizes HTML import and escapes titles in HTML export', async () => {
    const result = await importFile({ name: 'notes.html', bytes: new TextEncoder().encode('<h1>Title</h1><p>Hello<script>bad()</script></p>') })
    expect(JSON.stringify(result.document.content)).not.toContain('bad()')
    const exported = await exportBytes(createDocument('<script>bad()</script>'), 'html', '<p>Hello</p>')
    const text = new TextDecoder().decode(exported.bytes)
    expect(text).toContain('&lt;script&gt;')
    expect(text).not.toContain('<script>')
  })
  it('rejects unsupported and oversized input', async () => {
    await expect(importFile({ name: 'notes.exe', bytes: new Uint8Array() })).rejects.toThrow('Supported formats')
    await expect(importFile({ name: 'notes.txt', bytes: new Uint8Array(MAX_FILE_BYTES + 1) })).rejects.toThrow('20 MB')
  })
})
