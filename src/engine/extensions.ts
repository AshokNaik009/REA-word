import { Extension, Mark, Node } from '@tiptap/core'
import { paragraphProperties } from './properties'

const numericProperties = ['spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'firstLineIndent', 'lineSpacing'] as const
const booleanProperties = ['keepNext', 'keepLines', 'pageBreakBefore', 'widowControl'] as const
const cssProperties = { spaceBefore: 'margin-top', spaceAfter: 'margin-bottom', indentLeft: 'margin-left', indentRight: 'margin-right', firstLineIndent: 'text-indent' } as const
const dataName = (key: string) => `data-wc-${key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`

function numberFromHTML(element: HTMLElement, key: typeof numericProperties[number]): number | null {
  const raw = element.getAttribute(dataName(key))
  if (raw !== null) {
    const number = Number(raw)
    return Number.isFinite(number) && number >= (key.startsWith('indent') || key === 'firstLineIndent' ? -1584 : 0) && number <= 1584 ? number : null
  }
  if (key === 'lineSpacing') return null
  const css = element.style.getPropertyValue(cssProperties[key])
  const value = /^(-?\d+(?:\.\d+)?)(pt|px)$/.exec(css)
  if (!value) return null
  const points = Number(value[1]) * (value[2] === 'px' ? 0.75 : 1)
  return points >= -1584 && points <= 1584 ? points : null
}

export const ParagraphFormatting = Extension.create({
  name: 'paragraphFormatting',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        ...Object.fromEntries(numericProperties.map(key => [key, {
          default: null,
          parseHTML: (element: HTMLElement) => numberFromHTML(element, key),
          renderHTML: (attrs: Record<string, unknown>) => {
            if (!paragraphProperties.safeParse(attrs).success || attrs[key] == null) return {}
            const value = Number(attrs[key])
            const style = key === 'lineSpacing'
              ? `line-height: ${value}${attrs.lineRule === 'exactly' || attrs.lineRule === 'atLeast' ? 'pt' : ''}`
              : `${cssProperties[key]}: ${value}pt`
            return { [dataName(key)]: String(value), style }
          },
        }])),
        ...Object.fromEntries(booleanProperties.map(key => [key, {
          default: null,
          parseHTML: (element: HTMLElement) => element.hasAttribute(dataName(key)) ? element.getAttribute(dataName(key)) === 'true' : null,
          renderHTML: (attrs: Record<string, unknown>) => {
            if (typeof attrs[key] !== 'boolean') return {}
            const styles = {
              keepNext: 'break-after: avoid',
              keepLines: 'break-inside: avoid',
              pageBreakBefore: 'break-before: page',
              widowControl: `orphans: ${attrs[key] ? 2 : 1}; widows: ${attrs[key] ? 2 : 1}`,
            }
            return { [dataName(key)]: String(attrs[key]), style: key === 'widowControl' || attrs[key] ? styles[key] : '' }
          },
        }])),
        lineRule: {
          default: null,
          parseHTML: element => {
            const value = element.getAttribute(dataName('lineRule'))
            return ['multiple', 'exactly', 'atLeast'].includes(value ?? '') ? value : null
          },
          renderHTML: attrs => attrs.lineRule ? { [dataName('lineRule')]: attrs.lineRule } : {},
        },
        direction: {
          default: null,
          parseHTML: element => ['ltr', 'rtl'].includes(element.getAttribute('dir') ?? '') ? element.getAttribute('dir') : null,
          renderHTML: attrs => ['ltr', 'rtl'].includes(attrs.direction) ? { dir: attrs.direction } : {},
        },
      },
    }]
  },
})

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() { return [{ tag: 'div[data-wordcraft-page-break]' }] },
  renderHTML() { return ['div', { 'data-wordcraft-page-break': '', class: 'document-page-break', contenteditable: 'false', 'aria-label': 'Page break' }] },
})

export const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'subscript',
  parseHTML() { return [{ tag: 'sup' }] },
  renderHTML() { return ['sup', 0] },
})

export const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript',
  parseHTML() { return [{ tag: 'sub' }] },
  renderHTML() { return ['sub', 0] },
})
