import { isDesktop, native } from './desktop'
import { createDocument, filename, MAX_FILE_BYTES, parseDocument, textContent, type CraftDocument, type ExportFormat } from './document'
import { sanitizeHTML, validateContent } from './editor'
import { generateJSON } from '@tiptap/react'
import { extensions } from './editor'

export interface OpenedFile { name: string; bytes: Uint8Array }
export interface ImportResult { document: CraftDocument; warning?: string }

export async function pickNativeFile(): Promise<OpenedFile | null> {
  const { os, filesystem } = native()
  const paths = await os.showOpenDialog('Open a document', { multiSelections: false, filters: [{ name: 'Documents', extensions: ['wordcraft', 'docx', 'html', 'htm', 'txt'] }] })
  const path = paths[0]
  if (!path) return null
  const info = await filesystem.getStats(path)
  if (info.size > MAX_FILE_BYTES) throw new Error('Please choose a document smaller than 20 MB.')
  return { name: path.split(/[/\\]/).pop() ?? 'Document', bytes: new Uint8Array(await filesystem.readBinaryFile(path)) }
}

export async function importFile(file: OpenedFile): Promise<ImportResult> {
  if (file.bytes.byteLength > MAX_FILE_BYTES) throw new Error('Please choose a document smaller than 20 MB.')
  const extension = file.name.split('.').pop()?.toLowerCase()
  const title = file.name.replace(/\.[^.]+$/, '').slice(0, 200)
  let result: ImportResult
  if (extension === 'wordcraft') {
    const doc = parseDocument(new TextDecoder().decode(file.bytes))
    // Imports are copies: never silently overwrite an existing workspace document.
    result = { document: { ...doc, id: crypto.randomUUID(), updatedAt: new Date().toISOString() } }
  } else if (extension === 'docx') {
    const mammoth = await import('mammoth')
    const buffer = new Uint8Array(file.bytes).buffer
    const converted = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
      externalFileAccess: false,
      styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => p:fresh"],
    })
    result = {
      document: createDocument(title, generateJSON(sanitizeHTML(converted.value), extensions)),
      warning: 'DOCX imported as an editable copy. Basic text, headings, lists, tables and embedded images are supported. Page layout, comments, revisions, headers and advanced formatting may be lost. Keep your original file.',
    }
  } else if (extension === 'html' || extension === 'htm') {
    result = { document: createDocument(title, generateJSON(sanitizeHTML(new TextDecoder().decode(file.bytes)), extensions)) }
  } else if (extension === 'txt') {
    const text = new TextDecoder().decode(file.bytes)
    result = { document: createDocument(title, { type: 'doc', content: text.split(/\r\n|\r|\n/).map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : undefined })) }) }
  } else {
    throw new Error('Supported formats: .wordcraft, .docx, .html and .txt.')
  }
  validateContent(result.document.content)
  return result
}

function escapeHTML(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))
}

export async function exportBytes(doc: CraftDocument, format: ExportFormat, html: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const encode = (value: string) => new TextEncoder().encode(value)
  if (format === 'wordcraft') return { bytes: encode(JSON.stringify(doc, null, 2)), mime: 'application/json' }
  if (format === 'txt') return { bytes: encode(textContent(doc.content)), mime: 'text/plain;charset=utf-8' }
  if (format === 'html') {
    return { bytes: encode(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHTML(doc.title)}</title><style>body{max-width:720px;margin:64px auto;padding:0 24px;font:17px/1.7 Georgia,serif;color:#293c35}h1,h2,h3{line-height:1.2;color:#174f48}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px}blockquote{border-left:3px solid #174f48;margin:24px 0;padding-left:24px}</style></head><body>${sanitizeHTML(html)}</body></html>`), mime: 'text/html;charset=utf-8' }
  }
  const { exportDocx } = await import('./docx')
  return { bytes: await exportDocx(doc), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
}

export async function saveExport(doc: CraftDocument, format: ExportFormat, html: string): Promise<boolean> {
  const { bytes, mime } = await exportBytes(doc, format, html)
  const name = `${filename(doc.title)}.${format}`
  if (isDesktop()) {
    const { os, filesystem } = native()
    const path = await os.showSaveDialog('Export a document', { defaultPath: name, filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (!path) return false
    await filesystem.writeBinaryFile(path, new Uint8Array(bytes).buffer)
  } else {
    const blob = new Blob([new Uint8Array(bytes)], { type: mime })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return true
}
