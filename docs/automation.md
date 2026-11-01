# Automation And Source CLI

These adapters use the same `EditorSession` and command definitions as migrated UI actions.
They do not implement upstream position types, CLI compatibility or the MCP server.

## Browser / Desktop WebView

In the app's developer console or same-page Playwright context:

```javascript
window.wordcraft.commands()
window.wordcraft.execute('select.text', { text: 'a phrase', occurrence: 1 })
window.wordcraft.execute('format.bold', { value: true })
window.wordcraft.execute('para.spacing', { before: 12, after: 6 })
window.wordcraft.execute('insert.pageBreak')
window.wordcraft.document()
```

`select.text` is case-sensitive; occurrences are one-based, matching the upstream contract.
Font sizes and paragraph measurements are points; the existing UI font picker displays pixels.
The command list includes JSON parameter schemas. Schemas do not describe all cross-field
refinements; errors remain authoritative. Unknown or unsupported parameters are refused.

Calls return `{ok: true, changed, selection: {from, to}}` or
`{ok: false, error: {code, message}}`. Positions are ProseMirror UTF-16 offsets, **not** upstream
`Pos`/`StoryRef` positions. A changed typing mark can succeed without changing document JSON.
The current API edits only the current document; it never opens native dialogs.

Request-shaped calls are also supported:

```javascript
window.wordcraft.request({
  method: 'engine.execute',
  params: { command: 'format.superscript', params: { value: true } },
})
window.wordcraft.request({ method: 'engine.commands' })
window.wordcraft.request({ method: 'engine.document' })
```

There is no TCP server, externally reachable automation endpoint or native filesystem
capability added by this API. It is available to same-page code and follows the current
editor instance when switching documents. A reference to a destroyed session refuses edits.
Packaged builds keep the inspector disabled by default.

## Headless CLI

Requires a source checkout, Node.js 24 LTS (or 22.12+) and `npm ci`, including development
dependencies. The source CLI uses Vite's TypeScript module loader and jsdom as its DOM adapter.
It starts no app window or HTTP listener. It is not included as an executable in the DMG.
The packaged editor itself still needs neither Node.js nor Rust.

```bash
npm run cli -- commands
npm run cli -- run --text 'A first draft.' \
  --cmd 'select.text={"text":"draft"}' \
  --cmd format.bold \
  --output draft.wordcraft
npm run cli -- run --input draft.wordcraft \
  --cmd select.all \
  --cmd 'para.spacing={"before":12,"after":6}' \
  --output spaced.docx
npm run cli -- convert spaced.docx reopened.wordcraft
```

`run` accepts repeated `--cmd 'id=JSON'` arguments and either `--input` or `--text`.
Without `--output` it writes a native JSON document to stdout.
`convert` supports `.wordcraft`, `.docx`, `.html`, and `.txt`; lossy import notices go to stderr.
For machine-readable stdout, invoke `node scripts/cli.mjs ...` directly to omit npm's script banner.

Outputs are exclusively created: an existing output path fails, including when it equals
the input. There is no force-overwrite flag. All commands finish successfully before the
output is opened; failures leave the original input untouched. Interrupted writes may
leave an incomplete newly created output file, so always check the exit status.

Raw text insertion is bounded to 1,000,000 characters and 10,000 lines. The CLI does not
implement AutoCorrect; `text.insert` defaults to `raw: true` and rejects `raw: false`.
Table insertion is limited to 1000 cells. Unsupported catalog commands are errors,
not silent no-ops or hidden file dialogs.

```bash
npm run test:cli
npm run parity:check
```
