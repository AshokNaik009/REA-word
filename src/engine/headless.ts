import { Editor } from '@tiptap/core'
import { createDocument, type CraftDocument } from '../lib/document'
import { extensions } from '../lib/editor'
import { exportBytes, importFile } from '../lib/files'
import { EditorSession } from './session'

export function createHeadlessSession(document: CraftDocument = createDocument()) {
  const editor = new Editor({ extensions, content: document.content })
  const session = new EditorSession(editor)
  return {
    session,
    async import(name: string, bytes: Uint8Array) {
      const result = await importFile({ name, bytes })
      document = result.document
      editor.commands.setContent(document.content)
      return result.warning
    },
    async export(format: 'wordcraft' | 'docx' | 'html' | 'txt') {
      return exportBytes({ ...document, content: session.document(), updatedAt: new Date().toISOString() }, format, editor.getHTML())
    },
    snapshot(): CraftDocument { return { ...document, content: session.document() } },
    destroy() { editor.destroy() },
  }
}
