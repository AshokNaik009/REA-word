import { open, readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const usage = `Wordcraft TypeScript CLI (run from a source checkout with npm dependencies installed)
  npm run cli -- commands
  npm run cli -- run [--input file] [--text "Initial text"] --cmd 'select.all' --cmd 'format.bold' [--output file]
  npm run cli -- convert input.docx output.wordcraft
Formats: .wordcraft, .docx, .html, .txt. Output files must not already exist.
Commands share the UI engine and never open dialogs. Native document paths use your OS filesystem.
This does not implement the upstream MCP server or deterministic PDF rendering.
`

let server
let dom
let engine
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: 'string' }, output: { type: 'string' }, text: { type: 'string' },
      cmd: { type: 'string', multiple: true, default: [] }, help: { type: 'boolean' },
    },
  })
  const mode = positionals[0]
  if (values.help || !mode) { console.log(usage); process.exitCode = 0 }
  else {
    if (!['commands', 'run', 'convert'].includes(mode)) throw new Error(`Unknown CLI operation "${mode}". Use --help.`)
    if (mode === 'convert' && (positionals.length !== 3 || values.input || values.output || values.text || values.cmd.length)) throw new Error('Convert expects exactly an input and an output path.')
    if (mode !== 'convert' && positionals.length !== 1) throw new Error('Unexpected positional arguments.')
    if (values.input && values.text !== undefined) throw new Error('Choose --input or --text, not both.')
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://wordcraft.invalid', pretendToBeVisual: true })
    for (const key of ['window', 'document', 'DOMParser', 'HTMLElement', 'Element', 'Node', 'Text', 'MutationObserver', 'navigator', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
      const value = key === 'window' ? dom.window : dom.window[key]
      Object.defineProperty(globalThis, key, { value: typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(dom.window) : value, configurable: true, writable: true })
    }
    server = await createServer({
      root, logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null },
    })
    const { createHeadlessSession } = await server.ssrLoadModule('/src/engine/headless.ts')
    engine = createHeadlessSession()
    if (mode === 'commands') console.log(JSON.stringify(engine.session.commands(), null, 2))
    else {
      const input = mode === 'convert' ? positionals[1] : values.input
      const output = mode === 'convert' ? positionals[2] : values.output
      if (input) {
        const bytes = new Uint8Array(await readFile(resolve(input)))
        const warning = await engine.import(input, bytes)
        if (warning) console.error(warning)
      } else if (values.text !== undefined) {
        const result = engine.session.execute('text.insert', { text: values.text, paragraphs: true })
        if (!result.ok) throw new Error(result.error.message)
      }
      for (const argument of values.cmd) {
        const separator = argument.indexOf('=')
        const command = separator === -1 ? argument : argument.slice(0, separator)
        const params = separator === -1 ? {} : JSON.parse(argument.slice(separator + 1))
        const result = engine.session.execute(command, params)
        if (!result.ok) throw new Error(`${command}: ${result.error.code}: ${result.error.message}`)
      }
      if (output) {
        const format = extname(output).slice(1).toLowerCase()
        if (!['wordcraft', 'docx', 'html', 'txt'].includes(format)) throw new Error('Output extension must be .wordcraft, .docx, .html or .txt.')
        const { bytes } = await engine.export(format)
        const handle = await open(resolve(output), 'wx')
        try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
        console.log(`Created ${output}`)
      } else console.log(JSON.stringify(engine.snapshot(), null, 2))
    }
  }
} catch (error) {
  console.error(error?.code === 'EEXIST' ? 'Output already exists. Choose a new path; no existing file was overwritten.' : error instanceof Error ? error.message : 'CLI operation failed.')
  process.exitCode = 1
} finally {
  engine?.destroy()
  await server?.close()
  dom?.window.close()
}
