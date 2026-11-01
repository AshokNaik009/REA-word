import { z } from 'zod'
import type { EditorSession } from './session'

export function createAutomation(session: EditorSession) {
  return Object.freeze({
    version: 1 as const,
    commands: () => session.commands(),
    document: () => session.document(),
    execute: (id: string, params?: unknown) => session.execute(id, params),
    request(input: unknown): unknown {
      const parsed = z.discriminatedUnion('method', [
        z.object({ method: z.literal('engine.commands') }).strict(),
        z.object({ method: z.literal('engine.document') }).strict(),
        z.object({ method: z.literal('engine.execute'), params: z.object({ command: z.string().min(1).max(100), params: z.unknown().optional() }).strict() }).strict(),
      ]).safeParse(input)
      if (!parsed.success) return { ok: false, error: { code: 'INVALID_REQUEST', message: 'Expected engine.commands, engine.document, or engine.execute with command parameters.' } }
      if (parsed.data.method === 'engine.commands') return { ok: true, commands: session.commands() }
      if (parsed.data.method === 'engine.document') return { ok: true, document: session.document() }
      return session.execute(parsed.data.params.command, parsed.data.params.params)
    },
  })
}

declare global {
  interface Window { wordcraft?: ReturnType<typeof createAutomation> }
}
