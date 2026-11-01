# Upstream Reference

- Original: https://github.com/storytold/wordcraft
- Inspected revision: `8afe6bef6d6d1195e06f50776a318d19058214da`
- Original authors: ArtCraft Team and the WordCraft contributors.
- Original licensing: MIT OR Apache-2.0.
- Original clone is retained separately in `../wordcraft-original`.

This project is an independent TypeScript reimplementation of a subset of the original
product's workflow. The original repository's README, architecture and public UI
screenshots informed the feature investigation. Its source checkout remains untouched.

The Rust document model, layout renderer, file-format engines and UI have not been
translated or incorporated. Tiptap/ProseMirror supplies the current editing model;
Mammoth supplies basic DOCX import; docx supplies basic DOCX generation. Independently
written TypeScript adapters implement a growing subset of the upstream command contracts.

`docs/upstream-inventory.json` and the generated `docs/feature-parity.md` derive command
IDs, labels, locations and source references from the pinned upstream catalog and literal
command declarations. These metadata are used under the upstream MIT option; its
copyright and license are retained in `docs/LICENSE-UPSTREAM`. No upstream executable
code, proprietary application assets, or private documents are included.

The initial Tauri experiment was replaced by Neutralinojs at the owner's request.
No Rust sources or Rust toolchain are part of this project.

The new icon, interface styling and sample document text are original work for this
implementation. No ArtCraft logos or Microsoft product assets are included.
