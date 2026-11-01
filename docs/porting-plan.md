# Engine Migration

Status: first command/model migration milestone, version 0.2.0. Not a full port.

## Baseline

The pinned upstream revision is `8afe6bef6d6d1195e06f50776a318d19058214da`.
Its catalog has 520 entries for 497 distinct commands. Literal engine declarations add
more IDs, bringing the observed union to 662. Dynamic registrations and UI-only commands
make this a lower-bound source inventory, not an exhaustive behavioral specification.
The upstream catalog also contains aspirations; an ID alone does not prove upstream support.

Run `npm run parity` to regenerate the [matrix](feature-parity.md). No upstream checkout
or Rust installation is needed. Explicitly refresh the pinned source evidence with:

```bash
node scripts/parity.mjs --upstream ../wordcraft-original
```

Each ID stays partial until its parameters, selection semantics, editing behavior,
undo/redo, file exchange and platform behavior have regression evidence. No registry
stub counts as an implementation. Unsupported commands return an error without a dialog.
Existing UI-only features are not counted as callable engine commands.

## Current Layers

| Layer | Implementation | Boundary |
| --- | --- | --- |
| Document validation | `src/lib/document.ts`, `src/engine/properties.ts` | Bounded supported JSON tree; v1-to-v2 migration; no upstream model parity |
| Editing transactions | Tiptap/ProseMirror, `src/engine/extensions.ts` | Paragraph properties, atomic page breaks, mutually exclusive script marks |
| Command contracts | `src/engine/commands.ts` | Strict Zod validation, JSON parameter schemas, shared IDs and presets |
| Session | `src/engine/session.ts` | Structured results; document/selection/history rollback on command failure |
| File exchange | `src/lib/files.ts`, `docx.ts`, `docx-import.ts` | Native, HTML, TXT; limited DOCX conversion with explicit loss warnings |
| Frontend | React ribbon, palette and shortcut adapters | Dispatch migrated actions through the session; not all actions are migrated |
| Browser automation | `src/engine/automation.ts` | Same in-process session; no new listener or native capabilities |
| Headless adapter | `src/engine/headless.ts`, `scripts/cli.mjs` | Same command implementation with jsdom; no GUI, not DOM-free |
| Desktop host | Neutralinojs | Existing least-privilege native dialogs/storage; no Rust or Electron |

Discrete formatting commands have independent undo boundaries; grouped paragraph
changes form one transaction. Raw scripted text insertion inherits typing marks.
Mammoth browser/Node adapters receive their respective binary input options.
DOCX paragraph matching refuses to guess when converted structures no longer align.

## Milestones

| Stage | Scope | Status |
| --- | --- | --- |
| P0 | Rust-free shell, local workspace, import/export and native recovery | Existing foundation |
| P1 | Typed registry/session; first paragraph, character, break and table commands; headless CLI | Implemented subset; matrix remains partial |
| P2 | Richer model and OOXML preservation: styles, numbering definitions, sections, stories, unsupported-part retention | Not ported |
| P3 | Sections, editable headers/footers, fields/page numbering, columns and deterministic pagination | Not ported |
| P4 | Bookmarks, TOC, footnotes/endnotes, captions, cross-references, bibliography and citations | Not ported |
| P5 | Comments/replies, tracked edits and formatting, accept/reject, compare and proofing | Not ported |
| P6 | Advanced tables, formulas, anchored graphics, equations, drawing, charts and SmartArt | Not ported beyond basic editor tables/images |
| P7 | Mail merge, recipient sources, content controls, protection, templates and preferences | Not ported |
| P8 | Remaining format readers/writers, deterministic PDF, full CLI/control/MCP compatibility | Only source CLI and in-process automation started |
| P9 | Font metrics/shaping, accessibility, localization, corpus/performance/recovery and Windows/Linux acceptance | Not established |

The next engine/model work is P2, not a claim that the paper canvas has become a layout
engine. Reuse open-source TypeScript components where appropriate; preserve a clean
format/model boundary so richer engines can replace the current adapters.

## Acceptance Gates

- Invalid commands and failed imports do not alter writing or undo history.
- Every feature has edit, undo/redo and native save/reload tests.
- Format features include synthetic OOXML inspection and import/export tests; real-world
  corpus and layout comparison are separate gates.
- Browser and mobile tests exercise actual UI integration.
- Native tests verify native storage rather than browser fallback, plus packaged startup
  in the actual macOS system WebView.
- New outputs and source CLI operations never overwrite original input files.
- Platform binaries are not evidence that their system WebViews were manually tested.
- Do not copy proprietary assets or add Rust/Electron dependencies.

Tests in this milestone cover synthetic documents. They do not establish pixel-equivalent
Word layout, a hardened conversion sandbox, exhaustive command fidelity or Windows/Linux acceptance.
