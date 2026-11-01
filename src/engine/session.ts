import type { Editor, JSONContent } from '@tiptap/core'
import { ZodError } from 'zod'
import { commandDefinitions } from './commands'

export type CommandResult =
  | { ok: true; changed: boolean; selection: { from: number; to: number } }
  | { ok: false; error: { code: 'UNKNOWN_COMMAND' | 'INVALID_PARAMS' | 'DISABLED' | 'COMMAND_FAILED'; message: string } }

export class EditorSession {
  constructor(readonly editor: Editor) {}

  commands() {
    return commandDefinitions.map(({ id, label, parameters, preset }) => ({ id, label, parameters, preset }))
  }

  document(): JSONContent { return this.editor.getJSON() }

  execute(id: string, params: unknown = {}): CommandResult {
    if (typeof id !== 'string') return { ok: false, error: { code: 'UNKNOWN_COMMAND', message: 'Command ID must be a string.' } }
    const command = commandDefinitions.find(command => command.id === id)
    if (!command) return { ok: false, error: { code: 'UNKNOWN_COMMAND', message: `Command "${id}" has not been ported.` } }
    if (this.editor.isDestroyed || !this.editor.isEditable) return { ok: false, error: { code: 'DISABLED', message: 'The editor is not available for editing.' } }
    const before = this.editor.state
    const restore = () => {
      if (this.editor.state === before) return
      const contentChanged = !before.doc.eq(this.editor.state.doc)
      // Restore plugin state too: replacing only the JSON would leave a broken undo stack.
      this.editor.view.updateState(before)
      const event = { editor: this.editor, transaction: before.tr, appendedTransactions: [] }
      this.editor.emit('transaction', event)
      this.editor.emit('selectionUpdate', event)
      if (contentChanged) this.editor.emit('update', event)
    }
    try {
      if (!command.execute(this.editor, params)) {
        restore()
        return { ok: false, error: { code: 'DISABLED', message: 'This command is not available at the current selection.' } }
      }
      const { from, to } = this.editor.state.selection
      return { ok: true, changed: !before.doc.eq(this.editor.state.doc), selection: { from, to } }
    } catch (error) {
      try { restore() } catch { /* The state is restored even if a UI notification listener fails. */ }
      return { ok: false, error: {
        code: error instanceof ZodError ? 'INVALID_PARAMS' : 'COMMAND_FAILED',
        message: error instanceof ZodError ? error.issues.map(issue => `${issue.path.join('.') || 'params'}: ${issue.message}`).join('; ') : error instanceof Error ? error.message : 'Command could not be completed.',
      } }
    }
  }
}
