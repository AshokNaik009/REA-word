# Wordcraft Desktop

A local-first word processor built with **TypeScript, React, Tiptap and Neutralinojs**.
An independent reimplementation inspired by [storytold/wordcraft](https://github.com/storytold/wordcraft), not a complete port of its Rust engine.

**No Rust toolchain. No Electron runtime. No native application code to compile.**

## Port Progress

Version **0.2.0** starts the engine migration beyond the original desktop prototype:

- A UI-independent typed command/session layer shared by ribbon actions, command search, shortcuts and automation.
- 52 callable commands: 51 upstream IDs and one grouped paragraph-properties command. All remain partial upstream implementations.
- Page breaks, superscript/subscript, paragraph spacing and indents, text direction, print keep/widow controls, and table merge/split.
- Supported new properties survive native backups and synthetic DOCX exchange tests; unsupported DOCX structures still require keeping the original.
- A source-checkout headless CLI for scripted editing and document conversion, without opening a window.

The [generated parity matrix](docs/feature-parity.md) inventories **662 upstream command IDs**;
611 have no TS engine implementation yet. Counts measure command availability, not feature or layout fidelity.
See the [migration plan and architecture](docs/porting-plan.md) and [automation/CLI reference](docs/automation.md).

## What "No Rust" Means

| Task | Node.js needed? | Rust needed? | Native compiler needed? |
| --- | --- | --- | --- |
| Run the packaged desktop app | No | No | No |
| Develop the browser editor | Yes | No | No |
| Build the static web app | Yes | No | No |
| Develop the Neutralino desktop app | Yes | No | No |
| Package Windows, macOS and Linux portable executables | Yes | No | No |
| Make the provided macOS app / DMG | Yes, on macOS | No | No; uses macOS packaging tools |

All application logic is JS/TS. Neutralino supplies a **prebuilt C/C++ host** that uses the
operating system's WebView. It is not literally a native executable made only of JavaScript:
the native host is downloaded, rather than compiled in this repository.

Neutralino does not bundle Chromium, Electron or Node.js with the app. Its build CLI does
use `@electron/asar` as a development-only archive writer. That utility is not the Electron
runtime and does not ship Chromium.

The earlier Tauri prototype and its project-local Rust toolchain have been removed.

## Try The macOS Build

The local build is:

```text
release/Wordcraft-Desktop-0.2.0-macOS.dmg
```

1. Open the DMG.
2. Drag `Wordcraft Desktop.app` to Applications.
3. Open the application. It works without Node.js or Rust installed.
4. Use **File > New document**, edit, quit and reopen to check persistence.
5. Use **Export > Wordcraft document** to keep a portable backup.

The app is a universal binary for Apple Silicon and Intel Macs. This development build
is **ad-hoc signed, not Apple-notarized**. macOS may require confirmation through Finder's
Open action or Privacy & Security. Do not disable Gatekeeper globally.

Version 0.1.1 fixes first-launch initialization of Neutralino's native storage directory.
Quit the old application before opening the new build. Existing document storage is not cleared.
Version 0.2.0 writes version 2 native documents and reads/migrates version 1 documents.
Use 0.2.0 or later after migration: the old 0.1.x application cannot read version 2 documents.
Keep original backups; do not clear native storage to work around a downgrade error.

## Development Prerequisites

- **Node.js 24 LTS recommended**, or Node.js 22.12 or later.
- npm, included with Node.js.
- Internet access for the initial npm install and Neutralino runtime download.
- The OS WebView runtime described in the platform sections.
- Google Chrome for the default end-to-end test configuration.

No Rust, Cargo, C#, Electron, Xcode IDE, Visual Studio C++ compiler, or CMake is required
for the standard app build. Rebuilding the upstream Neutralino C/C++ host is a separate
task and is not part of these steps.

If you use nvm:

```bash
nvm install
nvm use
```

Node 22.1 is too old for the current Neutralino CLI's CommonJS/ESM dependencies.
An `ERR_REQUIRE_ESM` mentioning `uuid` is a reason to update Node, not install Rust.

## Browser Development And Web Build

These paths need only Node.js and npm, not even the Neutralino runtime download.
Run commands from this project directory.

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:1420`. The browser version uses IndexedDB and browser file
upload/download controls instead of native file dialogs.

For a production web build:

```bash
npm run build
npm run preview
```

Preview opens on `http://127.0.0.1:1421`. The deployable static files are in `dist/`.
Serve them over HTTP(S); do not open `dist/index.html` as a `file://` URL.
Browser workspaces are origin-specific: different ports, domains or browsers have separate data.

## Native Desktop Development

```bash
npm ci
npm run desktop:setup
npm run desktop:dev
```

- `desktop:setup` downloads the pinned Neutralino 6.10.0 prebuilt runtimes.
- `desktop:dev` builds the React UI and opens it in a native system-WebView window.
- `desktop:run` opens the existing web build without rebuilding it.
- Use `npm run dev` for the fastest browser hot-reload workflow.
- After UI changes, rerun `desktop:dev` to refresh the native build.

There is no globally installed `neu` prerequisite: npm uses the project's pinned CLI.

## Build Portable Apps For All Platforms

From macOS, Windows or Linux:

```bash
npm ci
npm run desktop:setup
npm run desktop:build
```

The frontend is compiled to JavaScript. Neutralino then packages prebuilt native hosts
with embedded resources. **This does not compile Rust or C/C++.**

Outputs:

```text
release/wordcraft-desktop/
  wordcraft-desktop-win_x64.exe
  wordcraft-desktop-mac_arm64
  wordcraft-desktop-mac_x64
  wordcraft-desktop-mac_universal
  wordcraft-desktop-linux_x64
  wordcraft-desktop-linux_arm64
  wordcraft-desktop-linux_armhf
release/wordcraft-desktop-release.zip
```

Each executable has its UI resources embedded. You do not need to distribute
`resources.neu` separately. OS WebView dependencies still apply.

These are **portable executables**, not Windows installers or Linux packages.
Generating every binary on one host does not prove it runs correctly on every target OS.
Windows and Linux need their own runtime acceptance testing before a public release.

## Windows

### Build And Run On Windows

Install Node.js 24 LTS and use PowerShell in the project folder:

```powershell
npm ci
npm run desktop:setup
npm run desktop:build
.\release\wordcraft-desktop\wordcraft-desktop-win_x64.exe
```

The Windows app requires **Microsoft Edge WebView2 Runtime**. It is commonly installed
already, but on a clean computer install the
[Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
Neither Node.js nor Rust is needed on the end user's machine.

The pinned Neutralino release supplies Windows x64. This project does not claim a
native Windows ARM64 build; x64 emulation is not the same as native ARM64 support.

### Installer And Signing

The `.exe` above is portable, not an installer. For an NSIS installer, follow
[Neutralino's distribution guide](https://neutralino.js.org/docs/distribution/overview/)
and its community builder integration. Installer generation may require NSIS.
Public distribution should use an Authenticode certificate; unsigned builds can trigger SmartScreen.
No certificate or signing credential is included in this repository.

## macOS

On a Mac with Node.js installed:

```bash
npm ci
npm run desktop:setup
npm run desktop:build
npm run desktop:mac
```

The last command uses the built universal executable, the original app icon,
macOS `codesign`, and `hdiutil`. It does not invoke Cargo, Rust, Swift or a C++ compiler.

Outputs for version 0.1.1:

```text
release/macos-0.1.1/Wordcraft Desktop.app
release/Wordcraft-Desktop-0.1.1-macOS.dmg
```

The wrapper reads the version from `package.json`. Future versions use their own output
directory so a build does not replace an older app executable while it is running.
The system WebView is WKWebView, supplied by macOS.

The script applies an **ad-hoc signature for local testing**. Before public distribution,
sign using your Developer ID Application identity and notarize/staple the app or DMG with
Apple's tools. This requires your own Apple Developer account and credentials.
Building a DMG with this script requires macOS; portable Windows/Linux binaries can still
be generated on that Mac.

## Linux

Install Node.js 24 LTS and your distribution's WebKitGTK runtime.
For recent Ubuntu/Debian systems, the usual runtime packages are:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-0 libayatana-appindicator3-1
```

Package names vary by distribution and release. Install equivalent GTK3/WebKitGTK
libraries on other distributions. These are runtime packages, not Rust or build compilers.

Then:

```bash
npm ci
npm run desktop:setup
npm run desktop:build
chmod +x release/wordcraft-desktop/wordcraft-desktop-linux_x64
./release/wordcraft-desktop/wordcraft-desktop-linux_x64
```

Use the `linux_arm64` or `linux_armhf` binary for a matching ARM system.
The binaries are dynamically linked; OS libraries and libc compatibility matter.
For `.deb` or AppImage installers, use the official distribution guide linked above.
AppImage packaging generally needs a Linux host; a portable executable is not an AppImage.

## Features And Limits

- Rich text, headings, font family/size/color, lists, alignment, highlights, links, superscript/subscript and undo/redo.
- Ribbon tabs, document library, heading outline, find/replace, focus mode and word counts.
- Tables with row/column editing and selected-cell merge/split; embedded PNG/JPEG/GIF/WebP images.
- Paragraph spacing, indents, RTL/LTR direction, line spacing, explicit page breaks and print keep/widow controls.
- A4/Letter, portrait/landscape, margin presets and print/PDF through the system print dialog.
- `.wordcraft` JSON backups preserve this editor's supported content and page settings.
- Basic `.docx`, `.html` and `.txt` import/export. Files open as copies, not in-place overwrites.

This is an initial editor, **not full Microsoft Word or upstream WordCraft parity**.
There is no original Rust layout engine, true on-screen pagination, track changes, comments,
mail merge, citations, footnotes, charts, macros, collaboration, legacy `.doc`/RTF/ODT support,
or lossless DOCX round trip. The paper canvas is continuous and printing performs pagination.
Its decorative running header/footer are UI chrome, not editable document headers/footers.

DOCX exchange can lose custom highlight colors, image dimensions, WebP images, merged-cell
row spans, section layout and advanced formatting. Keep original files and `.wordcraft` backups.
The import dialog warns about these limitations. Document imports are limited to 20 MB,
inserted image files to 5 MB, and DOCX main XML to 8 MB. The DOCX preflight bounds expanded
ZIP content to 60 MB. Large or untrusted office documents are not a hardened
document-conversion sandbox.

DOCX direct paragraph properties are restored only when the source and converted paragraph
sequences align. Otherwise the import notice explicitly reports that those properties were
not restored. Inherited styles, unusual document parts and notes may prevent matching.
Keep/widow rules affect browser-managed printing and DOCX; they do not implement on-screen pagination.
"At least" line spacing is approximate on the canvas.

## Storage And Privacy

Documents are processed on-device, with no account, server account or cloud upload.
Native communication uses an authenticated loopback WebSocket, not an internet document service.
The native API allowlist excludes shell/process execution and arbitrary network requests.
Imported HTML is sanitized; remote images are not fetched.

The browser uses IndexedDB, with a best-effort localStorage recovery snapshot.
The native app uses Neutralino's system storage, independent of its changing local port.
It alternates two complete workspace snapshots and retains an emergency recovery record.
On macOS the native storage directory is:

```text
~/Library/Application Support/dev.wordcraft.desktop/.storage/
```

Storage failures leave the current writing visible and block document switches.
Keep the window open and export a backup if a save fails. Native close waits for saving.
Do not clear app/browser data unless you have exported what you need.
Use one native app instance at a time; multi-instance conflict resolution is not implemented.

## Verification

```bash
npm run check
npm run test:cli
npm run test:e2e
npm run test:native
npm run parity:check
```

The default E2E suite uses installed Google Chrome. For WebKit testing, first run
`npx playwright install webkit`. Native smoke tests require `desktop:setup`.

Additional macOS checks, after `npm run build`:

```bash
WORDCRAFT_WEBKIT=1 node scripts/smoke-native.mjs
WORDCRAFT_NATIVE_WINDOW=1 node scripts/smoke-native.mjs
WORDCRAFT_BUNDLED_APP=1 node scripts/smoke-native.mjs
```

The first requires the real Neutralino backend rather than browser fallback.
The second launches a hidden **actual system-WebView window** with isolated test storage
and verifies that first launch creates and saves a workspace.
It does not drive the user's desktop with keystrokes.
The third runs that check against the actual packaged macOS executable after `desktop:mac`.
File dialogs, printing, OS signing prompts and Windows/Linux UI behavior still require manual testing.

`npm audit --omit=dev` checks shipped dependencies. The pinned Neutralino CLI currently
has development-only moderate advisories in its archive/glob dependency tree; it does not
process user documents in the installed app. Do not run build tools on untrusted project trees.

## Upstream And License

See [UPSTREAM.md](UPSTREAM.md) for the original repository and the scope of this rewrite,
[ATTRIBUTION.md](ATTRIBUTION.md) for assets and dependencies, and [LICENSE](LICENSE).
No Microsoft/Adobe product artwork or upstream ArtCraft trademarks are bundled.
