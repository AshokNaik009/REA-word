import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
const folder = await mkdtemp(join(tmpdir(), 'wordcraft-cli-'))
function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 20_000 })
  assert.equal(result.status, expectedStatus, result.stderr || result.error?.message)
  return result
}
const commands = JSON.parse(run(['commands']).stdout)
assert.ok(commands.find(command => command.id === 'format.superscript'))
assert.equal(new Set(commands.map(command => command.id)).size, commands.length)
const native = join(folder, 'edited.wordcraft')
run(['run', '--text', 'Alpha beta', '--cmd', 'select.all', '--cmd', 'para.spacing={"before":12,"after":6}', '--cmd', 'select.text={"text":"beta"}', '--cmd', 'format.superscript', '--output', native])
const source = await readFile(native, 'utf8')
const document = JSON.parse(source)
assert.equal(document.version, 2)
assert.equal(document.content.content[0].attrs.spaceBefore, 12)
assert.equal(document.content.content[0].content[1].marks[0].type, 'superscript')
const docx = join(folder, 'edited.docx')
run(['convert', native, docx])
const restored = join(folder, 'restored.wordcraft')
run(['convert', docx, restored])
const roundtrip = JSON.parse(await readFile(restored, 'utf8'))
assert.equal(roundtrip.content.content[0].attrs.spaceBefore, 12)
assert.ok(JSON.stringify(roundtrip.content).includes('superscript'))
const html = join(folder, 'edited.html')
run(['convert', native, html])
assert.ok((await readFile(html, 'utf8')).includes('<sup>beta</sup>'))
const text = join(folder, 'edited.txt')
run(['convert', native, text])
assert.equal(await readFile(text, 'utf8'), 'Alpha beta')
assert.match(run(['convert', native, native], 1).stderr, /already exists/)
assert.equal(await readFile(native, 'utf8'), source)
const refused = join(folder, 'must-not-exist.wordcraft')
run(['run', '--input', native, '--cmd', 'para.spacing={"before":"hostile"}', '--output', refused], 1)
await assert.rejects(stat(refused), { code: 'ENOENT' })
assert.equal(await readFile(native, 'utf8'), source)
console.log(`PASS: ${commands.length} shared commands; headless scripted editing; DOCX, HTML, TXT and native conversion; refusal preserves existing files.`)
