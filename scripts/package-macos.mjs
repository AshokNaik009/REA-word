import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform !== 'darwin') {
  console.error('Creating a signed .app / DMG requires macOS. Portable binaries can be built on any supported host.')
  process.exit(1)
}
const root = resolve(import.meta.dirname, '..')
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const macFolder = resolve(root, `release/macos-${version}`)
const contents = resolve(macFolder, 'Wordcraft Desktop.app/Contents')
await mkdir(`${contents}/MacOS`, { recursive: true })
await mkdir(`${contents}/Resources`, { recursive: true })
await copyFile(resolve(root, 'release/wordcraft-desktop/wordcraft-desktop-mac_universal'), `${contents}/MacOS/wordcraft-desktop`)
await chmod(`${contents}/MacOS/wordcraft-desktop`, 0o755)
await copyFile(resolve(root, 'public/app-icon.icns'), `${contents}/Resources/app-icon.icns`)
await writeFile(`${contents}/Info.plist`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Wordcraft Desktop</string>
<key>CFBundleDisplayName</key><string>Wordcraft Desktop</string>
<key>CFBundleIdentifier</key><string>dev.wordcraft.desktop</string>
<key>CFBundleExecutable</key><string>wordcraft-desktop</string>
<key>CFBundleIconFile</key><string>app-icon.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>11.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
`)
const appPath = resolve(contents, '..')
const commands = [
  ['codesign', ['--force', '--deep', '--sign', '-', appPath]],
  ['hdiutil', ['create', '-volname', `Wordcraft Desktop ${version}`, '-srcfolder', macFolder, '-ov', '-format', 'UDZO', resolve(root, `release/Wordcraft-Desktop-${version}-macOS.dmg`)]],
]
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log(`Created release/macos-${version}/Wordcraft Desktop.app and release/Wordcraft-Desktop-${version}-macOS.dmg`)
console.log('Ad-hoc signed for local testing only. Public distribution requires Developer ID signing and notarization.')
