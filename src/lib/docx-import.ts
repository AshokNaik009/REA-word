import { Unzip, UnzipInflate } from 'fflate'
import { paragraphProperties, type ParagraphProperties } from '../engine/properties'

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const MAX_EXPANDED_BYTES = 60 * 1024 * 1024
const MAX_XML_BYTES = 8 * 1024 * 1024

// Validate actual expanded bytes before handing the same archive to the converter.
// Streaming in small chunks bounds DEFLATE output even when ZIP sizes are dishonest.
export function readDocxMainXML(bytes: Uint8Array): string {
  let total = 0
  let entries = 0
  let completed = 0
  let mainSize = 0
  let failure: Error | undefined
  const chunks: Uint8Array[] = []
  const names = new Set<string>()
  const unzip = new Unzip(file => {
    if (++entries > 2000 || names.has(file.name)) throw new Error('DOCX has too many or duplicate ZIP entries.')
    names.add(file.name)
    let fileSize = 0
    file.ondata = (error, data, final) => {
      if (failure) return
      if (error) { failure = new Error('Could not decompress this DOCX file.'); return }
      total += data.length
      fileSize += data.length
      if (total > MAX_EXPANDED_BYTES || fileSize > 20 * 1024 * 1024) { failure = new Error('DOCX expands beyond the safe import limit.'); file.terminate(); return }
      if (file.name === 'word/document.xml') {
        mainSize += data.length
        if (mainSize > MAX_XML_BYTES) { failure = new Error('DOCX document XML exceeds the 8 MB import limit.'); file.terminate(); return }
        chunks.push(data.slice())
      }
      if (final) completed++
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for (let offset = 0; offset < bytes.length; offset += 1024) {
    unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length)
    if (failure) throw failure
  }
  if (!mainSize || completed !== entries) throw new Error('DOCX is incomplete or has no document body.')
  const xml = new Uint8Array(mainSize)
  let offset = 0
  for (const chunk of chunks) { xml.set(chunk, offset); offset += chunk.length }
  const text = new TextDecoder().decode(xml)
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('DOCX document XML must not contain entity declarations.')
  return text
}

function child(parent: Element | undefined, name: string): Element | undefined {
  return parent ? Array.from(parent.children).find(element => element.namespaceURI === WORD_NS && element.localName === name) : undefined
}
function attr(element: Element | undefined, name: string): string | undefined {
  return element?.getAttributeNS(WORD_NS, name) ?? undefined
}
function twips(element: Element | undefined, name: string): number | undefined {
  const raw = attr(element, name)
  if (raw === undefined || !/^-?\d+$/.test(raw)) return undefined
  const value = Number(raw) / 20
  return Number.isFinite(value) && Math.abs(value) <= 1584 ? value : undefined
}
function flag(element: Element | undefined): boolean | undefined {
  if (!element) return undefined
  return !['false', '0', 'off'].includes(attr(element, 'val') ?? '')
}
function properties(paragraph: Element): Partial<ParagraphProperties> {
  const props = child(paragraph, 'pPr')
  const spacing = child(props, 'spacing')
  const indent = child(props, 'ind')
  const line = attr(spacing, 'line')
  const rule = attr(spacing, 'lineRule')
  const result: Partial<ParagraphProperties> = {
    spaceBefore: twips(spacing, 'before'),
    spaceAfter: twips(spacing, 'after'),
    indentLeft: twips(indent, 'left') ?? twips(indent, 'start'),
    indentRight: twips(indent, 'right') ?? twips(indent, 'end'),
    firstLineIndent: twips(indent, 'hanging') !== undefined ? -Number(twips(indent, 'hanging')) : twips(indent, 'firstLine'),
    keepNext: flag(child(props, 'keepNext')),
    keepLines: flag(child(props, 'keepLines')),
    pageBreakBefore: flag(child(props, 'pageBreakBefore')),
    widowControl: flag(child(props, 'widowControl')),
    direction: child(props, 'bidi') ? flag(child(props, 'bidi')) ? 'rtl' : 'ltr' : undefined,
  }
  if (line && /^\d+$/.test(line)) {
    result.lineRule = rule === 'exact' ? 'exactly' : rule === 'atLeast' ? 'atLeast' : 'multiple'
    result.lineSpacing = Number(line) / (result.lineRule === 'multiple' ? 240 : 20)
  }
  return paragraphProperties.safeParse(result).success ? result : {}
}

export function restoreDocxProperties(html: string, xml: string): { html: string; mapped: boolean } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DOCX document XML must not contain entity declarations.')
  const source = new DOMParser().parseFromString(xml, 'application/xml')
  if (source.getElementsByTagName('parsererror').length) throw new Error('DOCX document XML is invalid.')
  const body = source.getElementsByTagNameNS(WORD_NS, 'body')[0]
  if (!body) throw new Error('DOCX has no document body.')
  const paragraphs = Array.from(body.getElementsByTagNameNS(WORD_NS, 'p'))
  const output = new DOMParser().parseFromString(html, 'text/html')
  // Mammoth may omit <p> inside <li>; give each list paragraph a stable element.
  output.querySelectorAll('li').forEach(item => {
    if (Array.from(item.children).some(element => /^(P|H[1-6])$/.test(element.tagName))) return
    const paragraph = output.createElement('p')
    for (const node of Array.from(item.childNodes)) {
      if (node instanceof Element && /^(UL|OL)$/.test(node.tagName)) break
      paragraph.append(node)
    }
    item.prepend(paragraph)
  })
  const targets = Array.from(output.querySelectorAll('p,h1,h2,h3,h4,h5,h6'))
  const normalized = (text: string) => text.replace(/\s+/g, '')
  const matches = paragraphs.length === targets.length && paragraphs.every((paragraph, index) =>
    normalized(Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map(text => text.textContent ?? '').join('')) === normalized(targets[index].textContent ?? ''))
  // Never guess paragraph indices: text boxes, notes or dropped content can shift them.
  if (matches) {
    paragraphs.forEach((paragraph, index) => {
      const target = targets[index]
      for (const [key, value] of Object.entries(properties(paragraph))) {
        if (value === undefined || value === null) continue
        if (key === 'direction') target.setAttribute('dir', String(value))
        else target.setAttribute(`data-wc-${key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`, String(value))
      }
    })
  }
  output.querySelectorAll('br.wc-page-break').forEach(breakElement => {
    const paragraph = breakElement.closest('p,h1,h2,h3,h4,h5,h6')
    if (!paragraph || !paragraph.parentNode) return
    const range = output.createRange()
    range.setStartAfter(breakElement)
    range.setEnd(paragraph, paragraph.childNodes.length)
    const after = paragraph.cloneNode(false)
    after.appendChild(range.extractContents())
    breakElement.remove()
    const marker = output.createElement('div')
    marker.setAttribute('data-wordcraft-page-break', '')
    paragraph.after(marker, after)
  })
  return { html: output.body.innerHTML, mapped: matches }
}
